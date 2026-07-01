# Use the official Python slim image
FROM python:3.10-slim

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /code

# Copy requirements and install dependencies
COPY requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy all project files into the container
COPY . /code

# Set up non-root user (UID 1000 is required by Hugging Face Spaces)
RUN useradd -m -u 1000 user
RUN chown -R user:user /code
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONPATH=/code

# Expose port 7860 for Hugging Face routing
EXPOSE 7860

# Start Flask backend via Gunicorn on port 7860
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "detection_plantation.app:app"]
