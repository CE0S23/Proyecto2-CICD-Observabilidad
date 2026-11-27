"""
Sonda de temperatura del host EC2.

Lee los sensores reales expuestos por el kernel del host (montado en /hostfs):
  - /hostfs/sys/class/thermal/thermal_zone*/temp   (miligrados C)
  - /hostfs/sys/class/hwmon/hwmon*/temp*_input     (miligrados C)
Cada 30 s envia un registro JSON a OpenObserve (stream "host_temperature").
Si el hipervisor no expone sensores (caso normal en EC2), envia available=false y
temperature_c=null: NO se inventan valores.
"""
import base64
import glob
import json
import os
import time
import urllib.request

ROOT = os.environ.get("HOSTFS", "/hostfs")
URL = "http://127.0.0.1:5080/api/default/host_temperature/_json"
AUTH = base64.b64encode(
    f"{os.environ.get('ZO_ROOT_USER_EMAIL', '')}:{os.environ.get('ZO_ROOT_USER_PASSWORD', '')}".encode()
).decode()
HOST = os.environ.get("HOST_LABEL", "ec2")
INTERVAL = int(os.environ.get("THERMAL_INTERVAL", "30"))
VALID_MIN, VALID_MAX = -40.0, 150.0


def read_sensors():
    sensors = []
    for path in glob.glob(f"{ROOT}/sys/class/thermal/thermal_zone*/temp"):
        sensors.append(("thermal_zone", path))
    for path in glob.glob(f"{ROOT}/sys/class/hwmon/hwmon*/temp*_input"):
        sensors.append(("hwmon", path))
    values, invalid = [], []
    for kind, path in sensors:
        try:
            with open(path) as fh:
                celsius = int(fh.read().strip()) / 1000.0
        except (OSError, ValueError):
            continue
        name = ""
        try:
            with open(os.path.join(os.path.dirname(path), "name")) as fh:
                name = fh.read().strip()
        except OSError:
            pass
        item = {"kind": kind, "name": name, "path": path.replace(ROOT, ""), "celsius": celsius}
        # Lecturas fisicamente imposibles (p. ej. -273.15 C del controlador NVMe virtual de EBS) no son datos reales.
        (values if VALID_MIN <= celsius <= VALID_MAX else invalid).append(item)
    return values, invalid


def listing(path):
    try:
        return sorted(os.listdir(f"{ROOT}{path}"))
    except OSError:
        return []


def main():
    while True:
        values, invalid = read_sensors()
        record = {
            "host": HOST,
            "metric": "host_temperature",
            "available": bool(values),
            "temperature_c": max(v["celsius"] for v in values) if values else None,
            "sensors_found": len(values),
            "sensors": json.dumps(values),
            "invalid_sensors": json.dumps(invalid),
            "status": "OK" if values else "N/D",
            "reason": ""
            if values
            else "EC2 (hipervisor Nitro) no expone sensores termicos de CPU: no hay thermal_zone; "
            "hwmon solo tiene el sensor virtual nvme (EBS) que reporta -273.15 C (valor invalido)",
            "thermal_dir": ",".join(listing("/sys/class/thermal")),
            "hwmon_dir": ",".join(listing("/sys/class/hwmon")),
        }
        req = urllib.request.Request(
            URL,
            data=json.dumps([record]).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Basic {AUTH}"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=10).read()
        except Exception as exc:  # O2 aun no esta listo o error de red: se reintenta en el siguiente ciclo
            print(json.dumps({"thermal_probe_error": str(exc)}))
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
