import datetime as dt
import hashlib
import hmac
import html
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = os.environ.get("TABLE_NAME", "")
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")
SENDER = os.environ.get("SENDER_EMAIL", "")

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

FREQUENCIES = {
    "daily": "once a day",
    "twice": "twice a day",
    "weekly": "once a week",
    "alerts": "only when severe weather is expected",
}
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

WMO = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers",
    82: "Violent showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm",
    96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
}

TEST_COOLDOWN = 60

_clients = {}
_token_cache = {}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def client(name):
    if name not in _clients:
        _clients[name] = boto3.resource("dynamodb").Table(TABLE_NAME) if name == "table" else boto3.client(name)
    return _clients[name]


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


# ---------------- auth ----------------

def current_user(headers):
    token = headers.get("x-auth") or ""
    if token.lower().startswith("bearer "):
        token = token[7:]
    if not token:
        raise ApiError(401, "Sign in to manage your updates")
    hit = _token_cache.get(token)
    if hit and hit["exp"] > time.time():
        return hit["user"]
    try:
        res = client("cognito-idp").get_user(AccessToken=token)
    except Exception:
        raise ApiError(401, "Your session has expired. Sign in again")
    attrs = {a["Name"]: a["Value"] for a in res.get("UserAttributes", [])}
    user = {"sub": attrs.get("sub"), "email": attrs.get("email"), "username": res.get("Username"),
            "verified": attrs.get("email_verified") == "true"}
    _token_cache[token] = {"user": user, "exp": time.time() + 300}
    return user


# ---------------- preferences ----------------

def validate(body):
    if not isinstance(body, dict):
        raise ApiError(400, "Send the settings as a JSON object")
    city = body.get("city") or {}
    try:
        lat = round(float(city.get("lat")), 3)
        lon = round(float(city.get("lon")), 3)
    except (TypeError, ValueError):
        raise ApiError(400, "Choose a city for your updates")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ApiError(400, "That city has invalid coordinates")
    name = str(city.get("name") or "").strip()[:80]
    if not name:
        raise ApiError(400, "Choose a city for your updates")
    freq = body.get("frequency")
    if freq not in FREQUENCIES:
        raise ApiError(400, "Choose how often you want updates")
    try:
        hour = int(body.get("hour", 7))
        weekday = int(body.get("weekday", 0))
        offset = int(body.get("utcOffsetMin", 330))
    except (TypeError, ValueError):
        raise ApiError(400, "Time settings must be whole numbers")
    if not 0 <= hour <= 23:
        raise ApiError(400, "Pick an hour between 0 and 23")
    if not 0 <= weekday <= 6:
        raise ApiError(400, "Pick a day of the week")
    if not -720 <= offset <= 840:
        raise ApiError(400, "Time zone offset is out of range")
    site = str(body.get("siteUrl") or "").strip()[:200]
    if site and not site.startswith("https://"):
        site = ""
    return {
        "city": {"name": name, "admin1": str(city.get("admin1") or "")[:80], "country": str(city.get("country") or "")[:80],
                 "lat": str(lat), "lon": str(lon)},
        "frequency": freq, "hour": hour, "weekday": weekday, "utcOffsetMin": offset,
        "alerts": bool(body.get("alerts", True)), "paused": bool(body.get("paused", False)), "siteUrl": site,
    }


def public(item):
    if not item:
        return None
    p = {k: item[k] for k in ("city", "frequency", "hour", "weekday", "utcOffsetMin", "alerts", "paused", "lastSent") if k in item}
    for k in ("hour", "weekday", "utcOffsetMin"):
        if k in p:
            p[k] = int(p[k])
    if "city" in p:
        p["city"] = {**p["city"], "lat": float(p["city"]["lat"]), "lon": float(p["city"]["lon"])}
    return p


def slots(prefs):
    h = int(prefs["hour"])
    f = prefs["frequency"]
    if f == "twice":
        return {h % 24, (h + 12) % 24}
    if f == "alerts":
        return {(h + k) % 24 for k in (0, 6, 12, 18)}
    return {h}


def floor30(t):
    return t.replace(minute=0 if t.minute < 30 else 30, second=0, microsecond=0)


def in_window(prefs, at):
    local = at + dt.timedelta(minutes=int(prefs["utcOffsetMin"]))
    return local if local.minute < 30 else None


def next_send(prefs, at=None):
    if prefs.get("paused"):
        return None
    at = floor30(at or now_utc())
    for k in range(1, 48 * 8 + 1):
        t = at + dt.timedelta(minutes=30 * k)
        local = in_window(prefs, t)
        if not local:
            continue
        if local.hour in slots(prefs) and (prefs["frequency"] != "weekly" or local.weekday() == int(prefs["weekday"])):
            return t.isoformat()
    return None


def due(prefs, at):
    """Returns 'digest', 'alert-check' or None for the 30-minute run that starts at `at` (UTC)."""
    if prefs.get("paused"):
        return None
    local = in_window(prefs, at)
    if not local:
        return None
    f = prefs["frequency"]
    h = int(prefs["hour"])
    if f == "alerts":
        return "alert-check" if local.hour in slots(prefs) else None
    if local.hour in slots(prefs) and (f != "weekly" or local.weekday() == int(prefs["weekday"])):
        return "digest"
    if prefs.get("alerts") and local.hour in {(h + 6) % 24, (h + 12) % 24, (h + 18) % 24}:
        return "alert-check"
    return None


# ---------------- weather ----------------

def fetch(url, params):
    q = urllib.parse.urlencode(params, safe=",")
    req = urllib.request.Request(f"{url}?{q}", headers={"User-Agent": "SunnyDay/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, TimeoutError):
        raise ApiError(502, "The weather service didn't respond")


def get_weather(lat, lon):
    raw = fetch(FORECAST_URL, {
        "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 7,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
        "hourly": "temperature_2m,precipitation_probability,weather_code,wind_gusts_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max,sunrise,sunset",
    })
    try:
        air = fetch(AIR_URL, {"latitude": lat, "longitude": lon, "current": "us_aqi"}).get("current", {}).get("us_aqi")
    except ApiError:
        air = None
    raw["aqi"] = air
    return raw


def severe(w):
    d = w["daily"]
    h = {k: v for k, v in w["hourly"].items()}
    h.setdefault("weather_code", [])
    h.setdefault("wind_gusts_10m", [])
    out = []
    if (d["temperature_2m_max"][0] or 0) >= 38:
        out.append(("Extreme heat", f"Highs near {round(d['temperature_2m_max'][0])}°C. Avoid the midday sun and drink water often."))
    if any(c in (95, 96, 99) for c in h["weather_code"][:24] if c is not None):
        out.append(("Thunderstorms", "Thunderstorms are forecast in the next 24 hours. Stay indoors when you hear thunder."))
    rain = d["precipitation_sum"][0] or 0
    if rain >= 35 or ((d["precipitation_probability_max"][0] or 0) >= 80 and rain >= 15):
        out.append(("Heavy rain", f"About {round(rain)} mm of rain is expected. Watch for waterlogged roads."))
    gust = max([(g or 0) for g in h["wind_gusts_10m"][:24]] or [0])
    if gust >= 50:
        out.append(("Strong winds", f"Gusts up to {round(gust)} km/h are possible."))
    if (w.get("aqi") or 0) > 150:
        out.append(("Poor air quality", f"US AQI is {round(w['aqi'])}. Limit long outdoor activity."))
    return out


PERIODS = ((9, "morning"), (15, "afternoon"), (19, "evening"), (23, "night"))


def summary(w, outlook_days=3):
    """What the email shows. After 5 pm local time the email looks ahead to tomorrow."""
    c = w["current"]
    d = w["daily"]
    h = w["hourly"]
    times = h["time"]
    now = c.get("time") or f"{d['time'][0]}T00:00"
    now_key = now[:13]
    focus = 1 if int(now[11:13]) >= 17 and len(d["time"]) > 1 else 0
    targets = dict(PERIODS)
    parts = []
    for i, t in enumerate(times):
        if t[:13] < now_key or int(t[11:13]) not in targets:
            continue
        name = targets[int(t[11:13])]
        if t[:10] == d["time"][0]:
            label = "Tonight" if name == "night" else name.capitalize()
        else:
            label = f"{dt.date.fromisoformat(t[:10]).strftime('%a')} {name}"
        parts.append({"label": label, "temp": round(h["temperature_2m"][i]), "pop": h["precipitation_probability"][i] or 0,
                      "cond": WMO.get(h["weather_code"][i], "")})
        if len(parts) == 4:
            break
    day = d["time"][focus]
    rain_hours = [t for i, t in enumerate(times) if t.startswith(day) and t[:13] >= now_key
                  and (h["precipitation_probability"][i] or 0) >= 60]
    end = min(len(d["time"]), focus + 1 + outlook_days)
    return {
        "temp": round(c["temperature_2m"]), "feels": round(c["apparent_temperature"]), "humidity": c["relative_humidity_2m"],
        "wind": round(c["wind_speed_10m"]), "cond": WMO.get(c["weather_code"], "Unknown"),
        "focus": focus, "day": day, "day_cond": WMO.get(d["weather_code"][focus], ""),
        "max": round(d["temperature_2m_max"][focus]), "min": round(d["temperature_2m_min"][focus]),
        "pop": d["precipitation_probability_max"][focus] or 0, "rain": d["precipitation_sum"][focus] or 0,
        "uv": d["uv_index_max"][focus], "aqi": w.get("aqi"), "parts": parts,
        "rain_from": rain_hours[0][11:16] if rain_hours else None,
        "days": [{"date": d["time"][i], "max": round(d["temperature_2m_max"][i]), "min": round(d["temperature_2m_min"][i]),
                  "pop": d["precipitation_probability_max"][i] or 0, "cond": WMO.get(d["weather_code"][i], "")}
                 for i in range(focus + 1, end)],
        "sunrise": d["sunrise"][focus][11:16], "sunset": d["sunset"][focus][11:16],
    }


# ---------------- email ----------------

def secret():
    item = client("table").get_item(Key={"pk": "CONFIG#secret"}).get("Item")
    if item:
        return item["value"]
    value = secrets.token_hex(32)
    try:
        client("table").put_item(Item={"pk": "CONFIG#secret", "value": value}, ConditionExpression="attribute_not_exists(pk)")
    except Exception:
        return client("table").get_item(Key={"pk": "CONFIG#secret"})["Item"]["value"]
    return value


def unsub_token(sub):
    return hmac.new(secret().encode(), sub.encode(), hashlib.sha256).hexdigest()[:32]


def clock(hhmm):
    h, m = int(hhmm[:2]), hhmm[3:5]
    return f"{h % 12 or 12}:{m} {'am' if h < 12 else 'pm'}"


def nice_day(date):
    return dt.date.fromisoformat(date).strftime("%a %d %b").replace(" 0", " ")


def render(prefs, w, alerts, kind, sub):
    e = html.escape
    s = summary(w, 6 if prefs.get("frequency") == "weekly" else 3)
    when = "Tomorrow" if s["focus"] else "Today"
    city = prefs["city"]["name"]
    site = (prefs.get("siteUrl") or "").rstrip("/")
    token = unsub_token(sub)
    unsub = f"{site}/api/unsubscribe?u={urllib.parse.quote(sub)}&t={token}" if site else ""
    is_alert = kind == "alert"
    if is_alert:
        subject = f"Weather alert for {city}: {', '.join(a[0].lower() for a in alerts)}"
    else:
        extra = f", rain likely from {clock(s['rain_from'])}" if s["rain_from"] else ""
        if s["focus"]:
            subject = f"{city} tomorrow: {s['day_cond'].lower()}, {s['max']}° / {s['min']}°{extra}"
        else:
            subject = f"{city}: {s['cond'].lower()}, {s['max']}° / {s['min']}°{extra}"
    band = "#1f2d55" if is_alert else "#4d9ee6" if s["pop"] < 50 else "#5f7995"
    alert_html = "".join(
        f'<tr><td style="padding:12px 16px;border-radius:12px;background:#fff4e5;border:1px solid #f2c27a;color:#5a3a06;font:14px/1.45 Arial,sans-serif">'
        f'<strong style="display:block;font-size:15px;margin-bottom:2px">{e(t)}</strong>{e(m)}</td></tr><tr><td style="height:8px"></td></tr>'
        for t, m in alerts)
    parts = "".join(
        f'<td style="padding:10px 6px;text-align:center;font:13px/1.4 Arial,sans-serif;color:#3e4c66">{e(v["label"])}<br>'
        f'<strong style="font-size:18px;color:#17233b">{v["temp"]}°</strong><br>{v["pop"]}% rain</td>'
        for v in s["parts"])
    days = "".join(
        f'<tr><td style="padding:8px 0;border-top:1px solid #e1e7ef;font:14px Arial,sans-serif;color:#17233b">{e(nice_day(d["date"]))}</td>'
        f'<td style="padding:8px 0;border-top:1px solid #e1e7ef;font:14px Arial,sans-serif;color:#3e4c66">{e(d["cond"])}</td>'
        f'<td style="padding:8px 0;border-top:1px solid #e1e7ef;font:14px Arial,sans-serif;color:#2a78d6;text-align:right">{d["pop"]}%</td>'
        f'<td style="padding:8px 0;border-top:1px solid #e1e7ef;font:bold 14px Arial,sans-serif;color:#17233b;text-align:right">{d["max"]}° / {d["min"]}°</td></tr>'
        for d in s["days"])
    facts = [f"Feels like {s['feels']}°", f"Humidity {s['humidity']}%", f"Wind {s['wind']} km/h",
             f"UV up to {s['uv']}", f"Sunrise {clock(s['sunrise'])}", f"Sunset {clock(s['sunset'])}"]
    if s["focus"]:
        facts[3:] = [f"UV tomorrow up to {s['uv']}", f"Sunrise tomorrow {clock(s['sunrise'])}", f"Sunset {clock(s['sunset'])}"]
    if s["aqi"] is not None:
        facts.insert(3, f"Air quality {round(s['aqi'])} (US AQI)")
    freq_label = FREQUENCIES[prefs["frequency"]]
    c = prefs["city"]
    open_url = f"{site}/?" + urllib.parse.urlencode({"place": c["name"], "region": c.get("admin1") or "", "country": c.get("country") or "",
                                                       "lat": c["lat"], "lon": c["lon"]}) + "#today"
    links = (f'<a href="{e(open_url)}" style="color:#2a78d6">Open {e(city)} on SunnyDay</a> · <a href="{e(site)}/#account" style="color:#2a78d6">Change settings</a>'
             f' · <a href="{e(unsub)}" style="color:#2a78d6">Unsubscribe</a>') if site else "Change settings in your SunnyDay account."
    body = f'''<!doctype html><html><body style="margin:0;background:#eef2f7;padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:{band};padding:24px 28px;color:#ffffff;font-family:Arial,sans-serif">
<div style="font-size:13px;opacity:.85">{"Severe weather alert" if is_alert else "Your SunnyDay update"} · {e(nice_day(w["daily"]["time"][0]))}</div>
<div style="font-size:26px;font-weight:bold;margin-top:4px">{e(city)}</div>
<div style="font-size:56px;font-weight:bold;line-height:1.1;margin-top:8px">{s["temp"]}°C</div>
<div style="font-size:17px">{e(s["cond"])} now</div>
<div style="font-size:15px;margin-top:6px">{when}: {e(s["day_cond"])} · High {s["max"]}° · Low {s["min"]}°</div>
<div style="font-size:14px;opacity:.9;margin-top:2px">{s["pop"]}% chance of rain{f", about {round(s['rain'])} mm" if s["rain"] >= 1 else ""}</div>
</td></tr>
<tr><td style="padding:20px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{alert_html}</table></td></tr>
<tr><td style="padding:0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fa;border-radius:14px"><tr>{parts}</tr></table></td></tr>
<tr><td style="padding:16px 24px 0;font:14px/1.6 Arial,sans-serif;color:#3e4c66">{" · ".join(e(f) for f in facts)}</td></tr>
<tr><td style="padding:16px 24px 8px"><div style="font:bold 15px Arial,sans-serif;color:#17233b;margin-bottom:4px">{"The week ahead" if len(s["days"]) > 3 else "Next 3 days"}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{days}</table></td></tr>
<tr><td style="padding:16px 24px 24px;font:12.5px/1.6 Arial,sans-serif;color:#66748b;border-top:1px solid #e1e7ef">
You get SunnyDay updates {e(freq_label)}.<br>{links}</td></tr>
</table></td></tr></table></body></html>'''
    text = "\n".join([
        subject, "",
        *[f"{t}: {m}" for t, m in alerts],
        f"Now {s['temp']}°C, {s['cond']}. {when}: {s['day_cond']}, high {s['max']}°, low {s['min']}°, {s['pop']}% chance of rain.",
        *[f"{v['label']}: {v['temp']}°, {v['pop']}% rain" for v in s["parts"]],
        "", "The week ahead:" if len(s["days"]) > 3 else "Next 3 days:",
        *[f"{nice_day(d['date'])}: {d['cond']}, {d['max']}° / {d['min']}°, {d['pop']}% rain" for d in s["days"]],
        "", f"You get SunnyDay updates {freq_label}.", f"Unsubscribe: {unsub}" if unsub else "",
    ])
    return subject, body, text


def send(to, subject, body, text):
    if not SENDER:
        raise ApiError(500, "The sender email address isn't configured")
    try:
        client("ses").send_email(
            Source=f"SunnyDay <{SENDER}>",
            Destination={"ToAddresses": [to]},
            Message={"Subject": {"Data": subject, "Charset": "UTF-8"},
                     "Body": {"Html": {"Data": body, "Charset": "UTF-8"}, "Text": {"Data": text, "Charset": "UTF-8"}}},
        )
    except client("ses").exceptions.MessageRejected as err:
        msg = str(err)
        if "not verified" in msg:
            raise ApiError(409, "Amazon SES is still in sandbox mode, so it can only send to verified addresses. Verify this address in the SES console or request production access")
        raise ApiError(502, "Amazon SES rejected the email")
    except ApiError:
        raise
    except Exception as err:
        print(f"SES send failed: {err!r}")
        raise ApiError(502, "The email service couldn't send right now. Try again in a few minutes")


# ---------------- routes ----------------

def get_account(user, _body, _qs):
    item = client("table").get_item(Key={"pk": f"USER#{user['sub']}"}).get("Item")
    prefs = public(item)
    return {"email": user["email"], "prefs": prefs, "nextUpdate": next_send(prefs) if prefs else None}


def save_account(user, body, _qs):
    prefs = validate(body)
    old = client("table").get_item(Key={"pk": f"USER#{user['sub']}"}).get("Item") or {}
    item = {"pk": f"USER#{user['sub']}", "sub": user["sub"], "email": user["email"], **prefs,
            "createdAt": old.get("createdAt") or now_utc().isoformat(timespec="seconds"),
            "updatedAt": now_utc().isoformat(timespec="seconds")}
    for k in ("lastSent", "lastAlert"):
        if k in old:
            item[k] = old[k]
    client("table").put_item(Item=item)
    p = public(item)
    return {"email": user["email"], "prefs": p, "nextUpdate": next_send(p)}


def delete_account(user, _body, _qs):
    client("table").delete_item(Key={"pk": f"USER#{user['sub']}"})
    try:
        client("cognito-idp").admin_delete_user(UserPoolId=USER_POOL_ID, Username=user["username"])
    except Exception as err:
        print(f"admin_delete_user failed: {err!r}")
    return {"deleted": True}


def test_email(user, _body, _qs):
    item = client("table").get_item(Key={"pk": f"USER#{user['sub']}"}).get("Item")
    if not item:
        raise ApiError(400, "Save your settings before sending a test email")
    wait = TEST_COOLDOWN - (time.time() - float(item.get("lastTest") or 0))
    if wait > 0:
        raise ApiError(429, f"You just sent a test email. Try again in {int(wait) + 1} seconds")
    w = get_weather(item["city"]["lat"], item["city"]["lon"])
    subject, body, text = render(item, w, severe(w), "digest", user["sub"])
    send(user["email"], f"[Test] {subject}", body, text)
    client("table").update_item(Key={"pk": f"USER#{user['sub']}"}, UpdateExpression="SET lastTest = :t",
                                ExpressionAttributeValues={":t": int(time.time())})
    return {"sent": True, "to": user["email"]}


def unsubscribe(qs):
    sub = qs.get("u", "")
    ok = sub and hmac.compare_digest(qs.get("t", ""), unsub_token(sub))
    if ok:
        try:
            client("table").update_item(Key={"pk": f"USER#{sub}"}, UpdateExpression="SET paused = :t",
                                        ConditionExpression="attribute_exists(pk)", ExpressionAttributeValues={":t": True})
        except Exception:
            ok = False
    msg = ("You're unsubscribed. You won't get any more SunnyDay emails. You can turn updates back on from your account at any time."
           if ok else "This unsubscribe link isn't valid. Open SunnyDay and change your settings from your account instead.")
    page = (f'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>SunnyDay</title></head>'
            f'<body style="font:16px/1.5 Arial,sans-serif;background:#eef2f7;color:#17233b;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px">'
            f'<div style="max-width:420px;background:#fff;border-radius:18px;padding:28px"><h1 style="margin:0 0 8px;font-size:22px">SunnyDay</h1>'
            f'<p style="margin:0 0 16px">{html.escape(msg)}</p><a href="/" style="color:#2a78d6">Go to SunnyDay</a></div></body></html>')
    return {"statusCode": 200 if ok else 400, "headers": {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"}, "body": page}


ROUTES = {
    ("GET", "/api/account"): get_account,
    ("POST", "/api/account"): save_account,
    ("DELETE", "/api/account"): delete_account,
    ("POST", "/api/account/test"): test_email,
}


def respond(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
            "body": json.dumps(body, default=str)}


# ---------------- scheduled digest ----------------

def run_digests(at=None):
    at = floor30(at or now_utc())
    table = client("table")
    items, start = [], None
    while True:
        kw = {"FilterExpression": Attr("pk").begins_with("USER#")}
        if start:
            kw["ExclusiveStartKey"] = start
        page = table.scan(**kw)
        items += page.get("Items", [])
        start = page.get("LastEvaluatedKey")
        if not start:
            break
    weather = {}
    sent, skipped, failed = 0, 0, 0
    slot = at.isoformat()
    for item in items:
        mode = due(item, at)
        if not mode or item.get("lastSent") == slot:
            skipped += 1
            continue
        local_date = (at + dt.timedelta(minutes=int(item["utcOffsetMin"]))).date().isoformat()
        key = (item["city"]["lat"], item["city"]["lon"])
        try:
            if key not in weather:
                weather[key] = get_weather(*key)
            w = weather[key]
            alerts = severe(w)
            if mode == "alert-check":
                if not alerts or item.get("lastAlert") == local_date:
                    skipped += 1
                    continue
                subject, body, text = render(item, w, alerts, "alert", item["sub"])
            else:
                subject, body, text = render(item, w, alerts if item.get("alerts", True) else [], "digest", item["sub"])
            send(item["email"], subject, body, text)
            expr = "SET lastSent = :s" + (", lastAlert = :d" if alerts and (mode == "alert-check" or item.get("alerts", True)) else "")
            vals = {":s": slot}
            if ":d" in expr:
                vals[":d"] = local_date
            table.update_item(Key={"pk": item["pk"]}, UpdateExpression=expr, ExpressionAttributeValues=vals)
            sent += 1
        except Exception as err:
            failed += 1
            print(f"digest failed for {item.get('sub')}: {err!r}")
    result = {"at": slot, "users": len(items), "sent": sent, "skipped": skipped, "failed": failed}
    print(json.dumps(result))
    return result


def handler(event, _context):
    if event.get("action") == "digest" or event.get("source") == "aws.scheduler":
        return run_digests()
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = (event.get("rawPath") or "/").rstrip("/")
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    qs = event.get("queryStringParameters") or {}
    if method == "OPTIONS":
        return respond(204, {})
    if path == "/api/unsubscribe":
        return unsubscribe(qs)
    if path == "/api/health":
        return respond(200, {"status": "ok"})
    route = ROUTES.get((method, path))
    if not route:
        return respond(404, {"error": f"No endpoint for {method} {path}"})
    try:
        body = {}
        if event.get("body"):
            raw = event["body"]
            if event.get("isBase64Encoded"):
                import base64
                raw = base64.b64decode(raw).decode()
            body = json.loads(raw)
        user = current_user(headers)
        return respond(200, route(user, body, qs))
    except json.JSONDecodeError:
        return respond(400, {"error": "The request body isn't valid JSON"})
    except ApiError as e:
        return respond(e.status, {"error": str(e)})
    except Exception as e:
        print(f"Unhandled error on {method} {path}: {e!r}")
        return respond(500, {"error": "Something went wrong on the server"})
