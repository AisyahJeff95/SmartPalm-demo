# Use official Python 3.10 slim image
FROM python:3.10-slim

# Install system C-libraries required by rasterio, shapely, pyproj, and gdal
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gdal-bin \
    libgdal-dev \
    libproj-dev \
    libgeos-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /code

# Copy requirements and install Python dependencies
COPY requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy all codebase files into the container
COPY . /code

# Set up non-root user (UID 1000 required by Hugging Face Spaces)
RUN useradd -m -u 1000 user && \
    chown -R user:user /code

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONPATH=/code \
    PORT=7860

# Expose port 7860 for Hugging Face Spaces
EXPOSE 7860

# Start prediction_server.py
CMD ["python3", "development/prediction_server.py"]
