import os
import sys
import json
from pathlib import Path

# Определяем базовую директорию (реальную или временную от PyInstaller)
if getattr(sys, 'frozen', False):
    CONFIG_BASE_PATH_OUT_EXE = sys._MEIPASS
else:
    CONFIG_BASE_PATH_OUT_EXE = '.'

CONFIG_FILE_PATH = os.path.join(CONFIG_BASE_PATH_OUT_EXE, 'settings_server.json')
try:
    with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
        config_data = json.load(f)
except Exception as e:
    raise RuntimeError(f"Не удалось загрузить settings_server.json: {e}")

# Загружаем значения из внешнего файла
HOST = config_data["HOST"]
PORT = config_data["PORT"]
ALLOWED_IPS = config_data["ALLOWED"]["IPS"]

DB_HOST = config_data["DB"]["HOST"]
DB_PORT = config_data["DB"]["PORT"]
DB_NAME = config_data["DB"]["NAME"]
DB_USER = config_data["DB"]["USER"]
DB_PASSWORD = config_data["DB"]["PASSWORD"]

TOKEN_REFRESH_TYPE = config_data["TOKEN"]["REFRESH"]["TYPE"]
TOKEN_ACCES_TYPE = config_data["TOKEN"]["ACCES"]["TYPE"]
TOKEN_ISSUER = config_data["TOKEN"]["ISSUER"]
TOKEN_AUDIENCE = config_data["TOKEN"]["AUDIENCE"]

USER_LIVE_PASSWORD = config_data["USER"]["TIME_LIVE_PASSWORD"]
USER_LOGIN_ATTEMPTS = config_data["USER"]["MAX_LOGIN_ATTEMPTS"]
USER_BLOCK_TIME = config_data["USER"]["BLOCK_TIME_MINUTES"]