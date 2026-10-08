"""Maintenance: generate bundled PT data using CoolProp==7.2.0.
No CoolProp installation is required by end users. Failed or nonmonotonic
curves are omitted; tables never extrapolate beyond their recorded range.
"""
import json
import re
from pathlib import Path
import CoolProp
from CoolProp.CoolProp import PropsSI, get_fluid_param_string, get_global_param_string

assert CoolProp.__version__ == '7.2.0'
folder = Path(__file__).resolve().parents[1] / 'extension/data'
fluids = {}
for fluid in get_global_param_string('fluids_list').split(','):
    aliases = [fluid] + get_fluid_param_string(fluid, 'aliases').split(',')
    names = [a.upper() for a in aliases if re.fullmatch(r'R(?:C)?\d+[A-Za-z]*(?:\([EZ]\))?', a, re.I)]
    if names:
        preferred = fluid.upper() if fluid.upper() in names else names[0]
        fluids[preferred] = (fluid, names)
for mixture in get_global_param_string('predefined_mixtures').split(','):
    name = mixture.upper().removesuffix('.MIX')
    if re.fullmatch(r'R\d+[A-Z]*', name) and name not in fluids:
        fluids[name] = (name + '.mix', [name])
registry = {}
omitted = []
for name, (fluid, aliases) in sorted(fluids.items()):
    # Preserve the existing verified R410A/R22 tables and resolution.
    if name in ('R410A', 'R22'):
        filename = name.lower() + '-pt.json'
    else:
        rows, dew_rows = [], []
        best_rows, best_dew = [], []
        minimum = PropsSI("Tmin", fluid) if ".mix" not in fluid else 100
        maximum = PropsSI("Tcrit", fluid) if ".mix" not in fluid else 1000
        for fahrenheit in range(-450, 201, 2):
            kelvin = (fahrenheit - 32) * 5 / 9 + 273.15
            if not minimum <= kelvin < maximum:
                continue
            try:
                pressures = [PropsSI('P', 'T', kelvin, 'Q', q, fluid) for q in (0, 1)]
                values = [round((p - 101325) / 6894.757293168, 6) for p in pressures]
                if not all(p > 0 for p in pressures):
                    continue
                if rows and (values[0] <= rows[-1][0] or values[1] <= dew_rows[-1][0]):
                    raise ValueError('nonmonotonic saturation curve')
                if rows:
                    midpoint = (fahrenheit + rows[-1][1]) / 2
                    for q, previous in [(0, rows[-1]), (1, dew_rows[-1])]:
                        midpoint_pressure = (PropsSI('P', 'T', (midpoint - 32) * 5 / 9 + 273.15, 'Q', q, fluid) - 101325) / 6894.757293168
                        interpolated = previous[1] + (midpoint_pressure - previous[0]) * (fahrenheit - previous[1]) / (values[q] - previous[0])
                        if abs(interpolated - midpoint) > .25:
                            raise ValueError('unreliable interpolation interval')
                rows.append([values[0], fahrenheit]); dew_rows.append([values[1], fahrenheit])
            except ValueError:
                if len(rows) > len(best_rows):
                    best_rows, best_dew = rows, dew_rows
                rows, dew_rows = [], []
        if len(best_rows) > len(rows):
            rows, dew_rows = best_rows, best_dew
        if len(rows) < 3:
            omitted.append(name)
            continue
        filename = name.lower().replace('(', '').replace(')', '') + '-pt.json'
        data = dict(refrigerant='R-' + name[1:], aliases=['R-' + a[1:] for a in aliases], phase='bubble (saturated liquid)',
                    dew_phase='dew (saturated vapor)', pressure_unit='psig', temperature_unit='degF',
                    atmospheric_pressure_pa=101325, source=f'CoolProp 7.2.0 {fluid} saturation data',
                    source_url='https://coolprop.org/fluid_properties/Mixtures.html' if '.mix' in fluid else f'https://coolprop.org/fluid_properties/fluids/{fluid}.html',
                    package_url='https://pypi.org/project/CoolProp/7.2.0/',
                    interpolation='linear temperature interpolation between pressure rows; no extrapolation',
                    points=rows, dew_points=dew_rows)
        (folder / filename).write_text(json.dumps(data, indent=2) + '\n')
    existing = json.loads((folder / filename).read_text())
    existing['aliases'] = ['R-' + a[1:] for a in aliases]
    (folder / filename).write_text(json.dumps(existing, indent=2) + '\n')
    canonical = 'R-' + name[1:]
    for alias in aliases:
        registry['R-' + alias[1:]] = dict(refrigerant=canonical, file=filename)
    print(canonical, flush=True)
(folder / 'refrigerants.json').write_text(json.dumps(registry, indent=2, sort_keys=True) + '\n')
print('Omitted:', omitted, flush=True)
