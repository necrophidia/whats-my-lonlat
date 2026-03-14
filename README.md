# What's My Lon/Lat?

A simple tool to find your current coordinates and calculate distances between locations.

**[Live Demo](https://necrophidia.github.io/whats-my-lonlat/)**

## Features

### My Location
- Detects your current position using the browser Geolocation API
- Continuously refines accuracy via `watchPosition`
- Click the map or drag the marker to set your exact location manually
- Copy coordinates to clipboard with one click

### Distance Calculator
- Search for places with autocomplete (powered by Nominatim)
- Calculates straight-line (haversine) distance between two points
- Displays origin/destination coordinates and a visual route on the map

## Tech

- [Leaflet](https://leafletjs.com) + [CARTO](https://carto.com/) tiles — no API key required
- [Nominatim](https://nominatim.openstreetmap.org) for place search/geocoding
- Vanilla JavaScript (ES6+), no build step
- Fully responsive

## Usage

Open `index.html` in a browser, or visit the [live demo](https://necrophidia.github.io/whats-my-lonlat/). Geolocation works best over HTTPS or localhost.
