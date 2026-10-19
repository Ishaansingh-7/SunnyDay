import datetime as dt
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.environ["SENDER_EMAIL"] = "updates@example.com"
os.environ["USER_POOL_ID"] = "ap-south-1_test"

import app  # noqa: E402

UTC = dt.timezone.utc


class FakeTable:
    def __init__(self):
        self.items = {}

    def get_item(self, Key):
        it = self.items.get(Key["pk"])
        return {"Item": json.loads(json.dumps(it))} if it else {}

    def put_item(self, Item, ConditionExpression=None):
        if ConditionExpression and Item["pk"] in self.items:
            raise Exception("ConditionalCheckFailed")
        self.items[Item["pk"]] = json.loads(json.dumps(Item))

    def delete_item(self, Key):
        self.items.pop(Key["pk"], None)

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues, ConditionExpression=None):
        if Key["pk"] not in self.items:
            raise Exception("ConditionalCheckFailed")
        it = self.items[Key["pk"]]
        for part in UpdateExpression.replace("SET ", "").split(","):
            k, v = [x.strip() for x in part.split("=")]
            it[k] = ExpressionAttributeValues[v]

    def scan(self, FilterExpression=None, ExclusiveStartKey=None):
        return {"Items": [json.loads(json.dumps(v)) for k, v in self.items.items() if k.startswith("USER#")]}


class FakeCognito:
    def __init__(self):
        self.deleted = []

    def get_user(self, AccessToken):
        if AccessToken != "good":
            raise Exception("NotAuthorized")
        return {"Username": "u-1", "UserAttributes": [{"Name": "sub", "Value": "sub-1"}, {"Name": "email", "Value": "user@example.com"},
                                                      {"Name": "email_verified", "Value": "true"}]}

    def admin_delete_user(self, UserPoolId, Username):
        self.deleted.append(Username)


class FakeSES:
    class exceptions:
        class MessageRejected(Exception):
            pass

    def __init__(self):
        self.sent = []
        self.fail = None

    def send_email(self, **kw):
        if self.fail:
            raise self.fail
        self.sent.append(kw)


def weather(hot=False, storm=False, now="2026-10-20T07:00", days=4):
    times = [f"2026-10-20T{h:02d}:00" for h in range(24)] + [f"2026-10-21T{h:02d}:00" for h in range(24)]
    dates = [f"2026-10-{20 + i}" for i in range(days)]
    return {
        "current": {"time": now, "temperature_2m": 31.4, "apparent_temperature": 35.2, "relative_humidity_2m": 66, "weather_code": 2, "wind_speed_10m": 12},
        "hourly": {"time": times, "temperature_2m": [27 + (h % 24) / 4 for h in range(48)],
                   "precipitation_probability": [70 if 14 <= h % 24 <= 17 else 10 for h in range(48)],
                   "weather_code": [95 if storm and h == 16 else 2 for h in range(48)], "wind_gusts_10m": [22] * 48},
        "daily": {"time": dates, "weather_code": ([61, 3, 1, 0] + [2] * 3)[:days],
                  "temperature_2m_max": ([39.2 if hot else 33.1, 32, 31, 33] + [34] * 3)[:days], "temperature_2m_min": ([24, 23, 23, 24] + [25] * 3)[:days],
                  "precipitation_sum": ([6.2, 0, 0, 0] + [0] * 3)[:days], "precipitation_probability_max": ([70, 20, 10, 0] + [5] * 3)[:days],
                  "uv_index_max": ([8.4, 7, 7, 8] + [9] * 3)[:days], "sunrise": ["2026-10-20T06:01"] * days, "sunset": ["2026-10-20T17:52"] * days},
        "aqi": 88,
    }


PREFS = {"city": {"name": "Vellore", "admin1": "Tamil Nadu", "country": "India", "lat": 12.92, "lon": 79.13},
         "frequency": "daily", "hour": 7, "weekday": 0, "utcOffsetMin": 330, "alerts": True, "paused": False,
         "siteUrl": "https://d123.cloudfront.net"}


def ev(method, path, body=None, token="good", qs=None):
    e = {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": {"X-Auth": token} if token else {},
         "queryStringParameters": qs}
    if body is not None:
        e["body"] = json.dumps(body)
    return e


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.table, self.cog, self.ses = FakeTable(), FakeCognito(), FakeSES()
        app._clients.clear()
        app._clients.update({"table": self.table, "cognito-idp": self.cog, "ses": self.ses})
        app._token_cache.clear()
        self.w = weather()
        app.get_weather = lambda lat, lon: self.w

    def call(self, *a, **k):
        r = app.handler(ev(*a, **k), None)
        return r["statusCode"], json.loads(r["body"]) if r["headers"]["Content-Type"].startswith("application/json") else r["body"]

    def test_auth_required(self):
        self.assertEqual(self.call("GET", "/api/account", token=None)[0], 401)
        self.assertEqual(self.call("GET", "/api/account", token="bad")[0], 401)

    def test_save_and_get(self):
        code, b = self.call("POST", "/api/account", PREFS)
        self.assertEqual(code, 200, b)
        self.assertEqual(b["prefs"]["city"]["lat"], 12.92)
        self.assertIsNotNone(b["nextUpdate"])
        code, b = self.call("GET", "/api/account")
        self.assertEqual(b["email"], "user@example.com")
        self.assertEqual(b["prefs"]["frequency"], "daily")

    def test_validation(self):
        for bad in [{**PREFS, "frequency": "hourly"}, {**PREFS, "hour": 25}, {**PREFS, "city": {}}, {**PREFS, "weekday": 9}]:
            self.assertEqual(self.call("POST", "/api/account", bad)[0], 400)
        self.assertEqual(self.call("POST", "/api/account", {**PREFS, "siteUrl": "javascript:x"})[0], 200)
        self.assertEqual(self.table.items["USER#sub-1"]["siteUrl"], "")

    def test_due_windows_ist(self):
        p = {**PREFS}
        self.assertEqual(app.due(p, dt.datetime(2026, 10, 20, 1, 30, tzinfo=UTC)), "digest")
        self.assertIsNone(app.due(p, dt.datetime(2026, 10, 20, 2, 0, tzinfo=UTC)))
        self.assertIsNone(app.due(p, dt.datetime(2026, 10, 20, 1, 0, tzinfo=UTC)))
        self.assertEqual(app.due(p, dt.datetime(2026, 10, 20, 7, 30, tzinfo=UTC)), "alert-check")
        self.assertIsNone(app.due({**p, "paused": True}, dt.datetime(2026, 10, 20, 1, 30, tzinfo=UTC)))
        tw = {**p, "frequency": "twice"}
        self.assertEqual(app.due(tw, dt.datetime(2026, 10, 20, 13, 30, tzinfo=UTC)), "digest")
        wk = {**p, "frequency": "weekly", "weekday": 1}
        self.assertEqual(app.due(wk, dt.datetime(2026, 10, 20, 1, 30, tzinfo=UTC)), "digest")
        self.assertIsNone(app.due(wk, dt.datetime(2026, 10, 21, 1, 30, tzinfo=UTC)))
        self.assertEqual(app.due({**p, "frequency": "alerts"}, dt.datetime(2026, 10, 20, 1, 30, tzinfo=UTC)), "alert-check")

    def test_next_send(self):
        nxt = app.next_send(PREFS, dt.datetime(2026, 10, 20, 2, 10, tzinfo=UTC))
        self.assertEqual(nxt, "2026-10-21T01:30:00+00:00")
        self.assertIsNone(app.next_send({**PREFS, "paused": True}))

    def test_digest_run_sends_once(self):
        self.call("POST", "/api/account", PREFS)
        at = dt.datetime(2026, 10, 20, 1, 30, tzinfo=UTC)
        r = app.run_digests(at)
        self.assertEqual(r["sent"], 1)
        msg = self.ses.sent[0]
        self.assertEqual(msg["Destination"]["ToAddresses"], ["user@example.com"])
        subject = msg["Message"]["Subject"]["Data"]
        self.assertIn("Vellore", subject)
        self.assertIn("rain likely from 2:00 pm", subject)
        html_body = msg["Message"]["Body"]["Html"]["Data"]
        self.assertIn("/api/unsubscribe?u=sub-1&amp;t=", html_body)
        self.assertIn("https://d123.cloudfront.net/?place=Vellore&amp;region=Tamil+Nadu&amp;country=India&amp;lat=12.92&amp;lon=79.13#today", html_body)
        self.assertEqual(app.run_digests(at)["sent"], 0)

    def test_alert_only_when_severe(self):
        self.call("POST", "/api/account", {**PREFS, "frequency": "alerts"})
        at = dt.datetime(2026, 10, 20, 1, 30, tzinfo=UTC)
        self.assertEqual(app.run_digests(at)["sent"], 0)
        self.w = weather(hot=True, storm=True)
        r = app.run_digests(at)
        self.assertEqual(r["sent"], 1)
        self.assertIn("Weather alert for Vellore: extreme heat, thunderstorms", self.ses.sent[0]["Message"]["Subject"]["Data"])
        self.assertEqual(app.run_digests(dt.datetime(2026, 10, 20, 7, 30, tzinfo=UTC))["sent"], 0)

    def test_unsubscribe(self):
        self.call("POST", "/api/account", PREFS)
        tok = app.unsub_token("sub-1")
        code, body = self.call("GET", "/api/unsubscribe", token=None, qs={"u": "sub-1", "t": tok})
        self.assertEqual(code, 200)
        self.assertTrue(self.table.items["USER#sub-1"]["paused"])
        code, _ = self.call("GET", "/api/unsubscribe", token=None, qs={"u": "sub-1", "t": "nope"})
        self.assertEqual(code, 400)

    def test_test_email_and_delete(self):
        self.assertEqual(self.call("POST", "/api/account/test", {})[0], 400)
        self.call("POST", "/api/account", PREFS)
        code, b = self.call("POST", "/api/account/test", {})
        self.assertEqual(code, 200)
        self.assertTrue(self.ses.sent[0]["Message"]["Subject"]["Data"].startswith("[Test]"))
        code, b = self.call("DELETE", "/api/account")
        self.assertTrue(b["deleted"])
        self.assertNotIn("USER#sub-1", self.table.items)
        self.assertEqual(self.cog.deleted, ["u-1"])

    def test_evening_email_looks_at_tomorrow(self):
        self.w = weather(now="2026-10-20T19:00")
        self.call("POST", "/api/account", {**PREFS, "frequency": "twice", "hour": 7})
        app.run_digests(dt.datetime(2026, 10, 20, 13, 30, tzinfo=UTC))
        msg = self.ses.sent[0]["Message"]
        self.assertTrue(msg["Subject"]["Data"].startswith("Vellore tomorrow: overcast, 32° / 23°"), msg["Subject"]["Data"])
        text = msg["Body"]["Text"]["Data"]
        self.assertIn("Tomorrow: Overcast", text)
        self.assertIn("Tonight:", text)
        self.assertNotIn("Morning:", text.split("Tonight:")[0])

    def test_parts_are_upcoming(self):
        s = app.summary(weather(now="2026-10-20T16:00"))
        self.assertEqual([p["label"] for p in s["parts"]], ["Evening", "Tonight", "Wed morning", "Wed afternoon"])

    def test_weekly_email_has_week_ahead(self):
        self.w = weather(days=7)
        self.call("POST", "/api/account", {**PREFS, "frequency": "weekly", "weekday": 1})
        app.run_digests(dt.datetime(2026, 10, 20, 1, 30, tzinfo=UTC))
        text = self.ses.sent[0]["Message"]["Body"]["Text"]["Data"]
        self.assertIn("The week ahead:", text)
        self.assertEqual(len(app.summary(self.w, 6)["days"]), 6)

    def test_test_email_cooldown(self):
        self.call("POST", "/api/account", PREFS)
        self.assertEqual(self.call("POST", "/api/account/test", {})[0], 200)
        code, b = self.call("POST", "/api/account/test", {})
        self.assertEqual(code, 429)
        self.assertIn("Try again in", b["error"])

    def test_ses_errors(self):
        self.call("POST", "/api/account", PREFS)
        self.ses.fail = FakeSES.exceptions.MessageRejected("Email address is not verified.")
        code, b = self.call("POST", "/api/account/test", {})
        self.assertEqual(code, 409)
        self.assertIn("sandbox", b["error"])
        self.ses.fail = RuntimeError("Throttling: Maximum sending rate exceeded")
        code, b = self.call("POST", "/api/account/test", {})
        self.assertEqual(code, 502)
        self.assertIn("couldn't send", b["error"])

    def test_unknown_route(self):
        self.assertEqual(self.call("GET", "/api/nothing")[0], 404)


if __name__ == "__main__":
    unittest.main()
