import sys
sys.path.append('backend')
from services.flow_service import get_flow_integrals
import pandas as pd
# monkey patch pd.DataFrame to intercept
old_init = pd.DataFrame.__init__
def new_init(self, data=None, *args, **kwargs):
    if isinstance(data, dict) and 's' in data and 'g' in data:
        print("s is unique:", data['s'].index.is_unique)
        print("g is unique:", data['g'].index.is_unique)
        if not data['s'].index.is_unique:
            print("Duplicated in s:")
            print(data['s'][data['s'].index.duplicated()])
        if not data['g'].index.is_unique:
            print("Duplicated in g:")
            print(data['g'][data['g'].index.duplicated()])
    old_init(self, data, *args, **kwargs)
pd.DataFrame.__init__ = new_init

get_flow_integrals('Cortez - SPE São Claus 1')
