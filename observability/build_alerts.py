"""
Crea en OpenObserve la plantilla, el destino y las 4 alertas operativas, y exporta todo a observability/alerts/.

Destino: webhook HTTP que escribe cada disparo en el stream "alert_events" del propio OpenObserve
(evidencia consultable de que la alerta se disparo). Puede cambiarse por Slack/email/SNS.

  O2_BASE=http://IP:5080 O2_USER=.. O2_PASSWORD=.. python observability/build_alerts.py
"""
import base64
import json
import os
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alerts")
BASE = os.environ["O2_BASE"].rstrip("/")
AUTH = base64.b64encode(f"{os.environ['O2_USER']}:{os.environ['O2_PASSWORD']}".encode()).decode()


def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Basic {AUTH}", "Content-Type": "application/json"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return r.status, json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


TEMPLATE = {
    "name": "registro_alerta",
    "type": "http",
    "title": "",
    "body": json.dumps([{
        "alert_name": "{alert_name}",
        "alert_type": "{alert_type}",
        "stream_name": "{stream_name}",
        "alert_period": "{alert_period}",
        "alert_operator": "{alert_operator}",
        "alert_threshold": "{alert_threshold}",
        "alert_count": "{alert_count}",
        "alert_start_time": "{alert_start_time}",
        "alert_end_time": "{alert_end_time}",
        "rows": "{rows}",
        "alert_url": "{alert_url}",
    }]),
}

DESTINATION = {
    "name": "webhook_alert_events",
    "type": "http",
    "url": "http://127.0.0.1:5080/api/default/alert_events/_json",
    "method": "post",
    "skip_tls_verify": False,
    "template": "registro_alerta",
    "headers": {"Authorization": f"Basic {AUTH}", "Content-Type": "application/json"},
}


def alert(name, desc, stream, stype, sql, period=5, frequency=1, silence=10):
    return {
        "name": name,
        "description": desc,
        "stream_type": stype,
        "stream_name": stream,
        "is_real_time": False,
        "enabled": True,
        "query_condition": {
            "type": "sql",
            "conditions": None,
            "sql": sql,
            "promql": None,
            "promql_condition": None,
            "aggregation": None,
            "vrl_function": None,
            "search_event_type": None,
            "multi_time_range": [],
        },
        "trigger_condition": {
            "period": period,
            "operator": ">=",
            "threshold": 1,
            "frequency": frequency,
            "frequency_type": "minutes",
            "cron": "",
            "silence": silence,
            "timezone": "UTC",
        },
        "destinations": [DESTINATION["name"]],
        "context_attributes": {},
        "row_template": "",
        "tz_offset": 0,
    }


ALERTS = [
    alert("app_5xx_rate_gt_5pct", "Tasa de errores 5xx mayor a 5% en los ultimos 5 minutos", "app_logs", "logs",
          "SELECT 100.0 * sum(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) / count(*) AS error_5xx_pct, count(*) AS total "
          "FROM \"app_logs\" WHERE event = 'http_request' HAVING error_5xx_pct > 5"),
    alert("app_latency_p95_gt_1s", "Latencia p95 de la API mayor a 1 segundo en los ultimos 5 minutos", "app_logs", "logs",
          "SELECT approx_percentile_cont(latency_ms, 0.95) AS p95_ms, count(*) AS total "
          "FROM \"app_logs\" WHERE event = 'http_request' HAVING p95_ms > 1000"),
    alert("host_cpu_gt_80pct", "Uso de CPU de la instancia EC2 mayor a 80% (promedio 5 minutos)", "system_cpu_utilization", "metrics",
          "SELECT 100 * (1 - avg(value)) AS cpu_pct FROM \"system_cpu_utilization\" WHERE state = 'idle' HAVING cpu_pct > 80"),
    alert("pipeline_failure", "Una ejecucion del pipeline CI/CD reporto status failure", "cicd_pipeline", "logs",
          "SELECT event, status, commit_sha, branch, actor, run_url FROM \"cicd_pipeline\" WHERE status = 'failure'",
          period=2, frequency=1, silence=1),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    print("template", *api("POST", "/api/default/alerts/templates", TEMPLATE))
    print("destination", *api("POST", "/api/default/alerts/destinations", DESTINATION))
    code, existing = api("GET", "/api/v2/default/alerts")
    names = {a["name"]: a.get("alert_id") for a in (existing or {}).get("list", [])} if code == 200 else {}
    for a in ALERTS:
        if a["name"] in names:
            code, res = api("PUT", f"/api/v2/default/alerts/{names[a['name']]}", {**a, "id": names[a["name"]]})
        else:
            code, res = api("POST", "/api/v2/default/alerts?folder=default", a)
        print(a["name"], code, res if isinstance(res, str) else "ok")
    redacted = {**DESTINATION, "headers": {"Authorization": "Basic <O2_USER:O2_PASSWORD en base64>", "Content-Type": "application/json"}}
    json.dump({"template": TEMPLATE, "destination": redacted, "alerts": ALERTS}, open(os.path.join(OUT, "alerts.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("JSON en", OUT)


if __name__ == "__main__":
    main()
