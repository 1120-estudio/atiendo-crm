"""Descarga polígonos públicos por ID sin enviar coordenadas de clientes."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlencode
from urllib.request import urlopen

LAYER = "https://services8.arcgis.com/XvhbIGOePiqXJBao/arcgis/rest/services/Costa_Rica_Distritos/FeatureServer/0"


def descargar(layer, params):
    url = layer.rstrip("/") + "/query?" + urlencode(params)
    with urlopen(url, timeout=60) as response:
        result = json.load(response)
    if "error" in result:
        raise ValueError("La fuente rechazó la consulta de límites")
    return result


def preparar(layer, destino, campo):
    listado = descargar(layer, {"where": "1=1", "returnIdsOnly": "true", "f": "json"})
    ids = sorted(set(listado["objectIds"]))
    if not ids:
        raise ValueError("La fuente no contiene distritos")
    def cargar(lote):
        features = []
        datos = descargar(layer, {"objectIds": ",".join(map(str, lote)),
                                  "outFields": campo + "," + listado["objectIdFieldName"],
                                  "outSR": 4326, "geometryPrecision": 6, "maxAllowableOffset": 0.00001,
                                  "returnGeometry": "true", "f": "geojson"})
        recibidos = set()
        for feature in datos["features"]:
            campos = feature["properties"]
            recibidos.add(campos[listado["objectIdFieldName"]])
            codigo = str(campos[campo])
            geo = feature["geometry"]
            if not (codigo.isascii() and codigo.isdigit() and len(codigo) == 5 and
                    geo["type"] in ("Polygon", "MultiPolygon") and geo["coordinates"]):
                raise ValueError("Distrito con código o geometría incompleta")
            features.append({"type": "Feature", "properties": {"codigo": codigo}, "geometry": geo})
        if recibidos != set(lote):
            raise ValueError("La fuente entregó una página incompleta")
        return features

    lotes = [ids[i:i + 15] for i in range(0, len(ids), 15)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        features = [f for lote in pool.map(cargar, lotes) for f in lote]
    with NamedTemporaryFile(mode="w", dir=destino.parent, delete=False, encoding="utf-8") as tmp:
        json.dump({"type": "FeatureCollection", "source": layer, "features": features}, tmp,
                  separators=(",", ":"))
    Path(tmp.name).chmod(0o644)
    Path(tmp.name).replace(destino)
    print(f"{len(features)} polígonos descargados en {destino}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archivo", type=Path)
    parser.add_argument("--capa", default=LAYER, help="Capa ArcGIS distrital validada")
    parser.add_argument("--campo", default="codigo_dta", help="Campo del código DTA completo")
    args = parser.parse_args()
    preparar(args.capa, args.archivo, args.campo)
