FROM python:3.13-alpine
WORKDIR /app
COPY server.py .
USER 65534:65534
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=2)" || exit 1
CMD ["python", "server.py"]
