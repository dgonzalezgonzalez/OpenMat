#!/usr/bin/env python3
"""Per-variable bit-exactness breakdown between the MATLAB and OpenMat reports.

Usage: breakdown.py <matlab.json> <openmat.json>
"""
import json
import sys


def blocks(doc):
    sc = doc["scripts"]
    return sc["blocks"] if isinstance(sc, dict) else sc[0]["blocks"]


def mat_values(block, name):
    w = block["workspace"].get(name)
    if not w or w.get("kind") != "matrix":
        return None
    d = w["data"]
    return d if isinstance(d, list) else [d]


def rel(a, b):
    if a == b:
        return 0.0
    denom = abs(a) if a else 1.0
    return abs(a - b) / denom


def main(mat_path, om_path):
    m = json.load(open(mat_path))
    o = json.load(open(om_path))
    mb = {b["name"].split(":")[0]: b for b in blocks(m)}
    ob = {b["name"].split(":")[0]: b for b in blocks(o)}

    total_exact = total_diff = 0
    for key in mb:
        if key not in ob:
            print(f"{key}: MISSING on OpenMat side")
            continue
        print(f"== {key} ==")
        mws, ows = mb[key]["workspace"], ob[key]["workspace"]
        for name in sorted(mws):
            if name not in ows:
                print(f"  {name}: MISSING on OpenMat side")
                continue
            a = mat_values(mb[key], name)
            b = mat_values(ob[key], name)
            if a is None or b is None:
                kind_m = mws[name].get("kind")
                kind_o = ows[name].get("kind")
                if kind_m != kind_o:
                    print(f"  {name}: KIND MISMATCH mat={kind_m} om={kind_o}")
                continue
            n = min(len(a), len(b))
            ex = sum(1 for i in range(n) if a[i] == b[i])
            df = n - ex
            worst = 0.0
            where = None
            for i in range(n):
                r = rel(a[i], b[i])
                if r > worst:
                    worst, where = r, (i, a[i], b[i])
            total_exact += ex
            total_diff += df
            if df:
                print(
                    f"  {name}: exact={ex}/{n} diff={df} worst-rel={worst:.3e} "
                    f"at {where}"
                )
            else:
                print(f"  {name}: exact={ex}/{n}  (bit-exact)")
    print(f"TOTAL bit-exact={total_exact}  differing={total_diff}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
