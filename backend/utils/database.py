"""Shared DB handle. Import `get_db()` — returns None when MONGO_URL unset."""
import os
from pymongo import MongoClient

_client = None


def get_db():
    global _client
    if _client is None:
        url = os.environ.get("MONGO_URL", "")
        if not url:
            return None
        _client = MongoClient(url)
    return _client[os.environ.get("DB_NAME", "apppilot")]
