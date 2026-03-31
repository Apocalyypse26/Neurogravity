#!/bin/sh
pip install -r requirements.txt
exec gunicorn main:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 --workers 2 --threads 4 --timeout 120
