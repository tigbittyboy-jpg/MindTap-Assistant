"""Maintenance only: pip install CoolProp==7.2.0, then run this script.
End users need no CoolProp dependency: both calculators read the bundled JSON.
"""
import json
from pathlib import Path
import CoolProp
from CoolProp.CoolProp import PropsSI, get_fluid_param_string

assert CoolProp.__version__ == '7.2.0', 'Use the documented CoolProp version.'
for fluid, name in [('R410A', 'R-410A'), ('R22', 'R-22')]:
    rows = []
    dew_rows = []
    for fahrenheit in range(-40, 141):
        kelvin = (fahrenheit - 32) * 5 / 9 + 273.15
        pascals = PropsSI('P', 'T', kelvin, 'Q', 0, fluid)
        rows.append([round((pascals - 101325) / 6894.757293168, 6), fahrenheit])
        dew = PropsSI('P', 'T', kelvin, 'Q', 1, fluid)
        dew_rows.append([round((dew - 101325) / 6894.757293168, 6), fahrenheit])
    data = {
        'refrigerant': name, 'phase': 'bubble (saturated liquid)', 'dew_phase': 'dew (saturated vapor)',
        'pressure_unit': 'psig', 'temperature_unit': 'degF', 'atmospheric_pressure_pa': 101325,
        'source': f'CoolProp 7.2.0 {fluid} equation of state ({get_fluid_param_string(fluid, "BibTeX-EOS")})',
        'source_url': f'https://coolprop.org/fluid_properties/fluids/{fluid}.html',
        'package_url': 'https://pypi.org/project/CoolProp/7.2.0/',
        'eos_reference': get_fluid_param_string(fluid, 'BibTeX-EOS'),
        'interpolation': 'linear temperature interpolation between pressure rows; no extrapolation',
        'points': rows, 'dew_points': dew_rows,
    }
    path = Path(__file__).resolve().parents[1] / f'extension/data/{fluid.lower()}-pt.json'
    path.write_text(json.dumps(data, indent=2) + '\n')
    print(f'Generated {len(rows)} bubble-point rows in {path}')
