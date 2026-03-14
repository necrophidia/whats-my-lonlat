(() => {
    'use strict';

    // --- Tab switching ---
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const maps = {};

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(target).classList.add('active');

            // Invalidate map size after tab switch
            setTimeout(() => {
                if (maps[target]) maps[target].invalidateSize();
            }, 100);
        });
    });

    // --- Shared ---
    const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';
    const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

    function createMap(elementId, center = [0, 0], zoom = 2) {
        const map = L.map(elementId).setView(center, zoom);
        L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
        return map;
    }

    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const toRad = deg => deg * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // --- My Location ---
    const locateBtn = document.getElementById('locate-btn');
    const locateStatus = document.getElementById('locate-status');
    const locateCoords = document.getElementById('locate-coords');
    const latValue = document.getElementById('lat-value');
    const lngValue = document.getElementById('lng-value');
    const accValue = document.getElementById('acc-value');
    const copyBtn = document.getElementById('copy-btn');

    let locateMap = null;
    let locateMarker = null;
    let locateCircle = null;
    let watchId = null;

    locateBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showStatus('Geolocation is not supported by your browser.', 'error');
            return;
        }

        // Stop any previous watch
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }

        showStatus('Finding your location...', 'loading');
        locateBtn.disabled = true;

        let firstFix = true;

        watchId = navigator.geolocation.watchPosition(
            position => {
                const { latitude, longitude, accuracy } = position.coords;

                accValue.textContent = accuracy < 1000
                    ? `${Math.round(accuracy)} m`
                    : `${(accuracy / 1000).toFixed(1)} km`;

                locateStatus.hidden = true;
                locateBtn.textContent = 'Update Location';
                locateBtn.disabled = false;

                if (firstFix) {
                    locateMap.setView([latitude, longitude], 17);
                    firstFix = false;
                }

                updateLocateMarker(latitude, longitude, `You are here<br>(within ${Math.round(accuracy)} m)`);

                if (locateCircle) locateMap.removeLayer(locateCircle);
                locateCircle = L.circle([latitude, longitude], {
                    radius: accuracy,
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.1,
                    weight: 1,
                }).addTo(locateMap);
            },
            error => {
                const messages = {
                    1: 'Location access denied. Please enable location permissions.',
                    2: 'Position unavailable. Try again.',
                    3: 'Request timed out. Try again.',
                };
                showStatus(messages[error.code] || 'Failed to get location.', 'error');
                locateBtn.disabled = false;
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    });

    function updateLocateMarker(lat, lng, popup) {
        latValue.textContent = lat.toFixed(6);
        lngValue.textContent = lng.toFixed(6);
        locateCoords.hidden = false;

        if (locateMarker) locateMap.removeLayer(locateMarker);
        if (locateCircle) locateMap.removeLayer(locateCircle);
        locateCircle = null;

        locateMarker = L.marker([lat, lng], { draggable: true })
            .addTo(locateMap)
            .bindPopup(popup)
            .openPopup();

        locateMarker.on('dragend', () => {
            stopWatch();
            const pos = locateMarker.getLatLng();
            latValue.textContent = pos.lat.toFixed(6);
            lngValue.textContent = pos.lng.toFixed(6);
            accValue.textContent = 'Manual';
        });
    }

    function stopWatch() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    }

    copyBtn.addEventListener('click', () => {
        const text = `${latValue.textContent}, ${lngValue.textContent}`;
        navigator.clipboard.writeText(text).then(() => {
            const original = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = original, 1500);
        });
    });

    function showStatus(msg, type) {
        locateStatus.textContent = msg;
        locateStatus.className = `status ${type}`;
        locateStatus.hidden = false;
    }

    // Initialize locate map
    locateMap = createMap('locate-map');
    maps.locate = locateMap;

    locateMap.on('click', e => {
        stopWatch();
        updateLocateMarker(e.latlng.lat, e.latlng.lng, 'Custom location');
        accValue.textContent = 'Manual';
        locateStatus.hidden = true;
    });

    // --- Distance Calculator ---
    let distanceMap = null;
    let originData = null;
    let destData = null;
    let routeLine = null;
    let distMarkers = [];

    const originInput = document.getElementById('origin');
    const destInput = document.getElementById('destination');
    const originSuggestions = document.getElementById('origin-suggestions');
    const destSuggestions = document.getElementById('destination-suggestions');
    const calcBtn = document.getElementById('calc-btn');
    const distResult = document.getElementById('distance-result');
    const distValue = document.getElementById('dist-value');
    const originCoordsEl = document.getElementById('origin-coords');
    const destCoordsEl = document.getElementById('dest-coords');

    function debounce(fn, delay) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    async function searchPlace(query) {
        if (query.length < 3) return [];
        const params = new URLSearchParams({ q: query, format: 'json', limit: '5' });
        const res = await fetch(`${NOMINATIM_URL}?${params}`, {
            headers: { 'Accept-Language': 'en' }
        });
        return res.json();
    }

    function setupAutocomplete(input, suggestionsList, onSelect) {
        const doSearch = debounce(async () => {
            const results = await searchPlace(input.value);
            suggestionsList.innerHTML = '';
            if (results.length === 0) {
                suggestionsList.hidden = true;
                return;
            }
            results.forEach(place => {
                const li = document.createElement('li');
                li.textContent = place.display_name;
                li.addEventListener('click', () => {
                    input.value = place.display_name;
                    suggestionsList.hidden = true;
                    onSelect({ lat: parseFloat(place.lat), lng: parseFloat(place.lon), name: place.display_name });
                    updateCalcBtn();
                });
                suggestionsList.appendChild(li);
            });
            suggestionsList.hidden = false;
        }, 300);

        input.addEventListener('input', doSearch);

        // Close suggestions when clicking elsewhere
        document.addEventListener('click', e => {
            if (!input.contains(e.target) && !suggestionsList.contains(e.target)) {
                suggestionsList.hidden = true;
            }
        });
    }

    setupAutocomplete(originInput, originSuggestions, data => { originData = data; });
    setupAutocomplete(destInput, destSuggestions, data => { destData = data; });

    function updateCalcBtn() {
        calcBtn.disabled = !(originData && destData);
    }

    const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
    const durationValue = document.getElementById('duration-value');

    function formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.round((seconds % 3600) / 60);
        if (h > 0) return `${h} hr ${m} min`;
        return `${m} min`;
    }

    function decodePolyline(encoded) {
        const points = [];
        let lat = 0, lng = 0, i = 0;
        while (i < encoded.length) {
            let shift = 0, result = 0, byte;
            do { byte = encoded.charCodeAt(i++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            lat += (result & 1) ? ~(result >> 1) : (result >> 1);
            shift = 0; result = 0;
            do { byte = encoded.charCodeAt(i++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            lng += (result & 1) ? ~(result >> 1) : (result >> 1);
            points.push([lat / 1e5, lng / 1e5]);
        }
        return points;
    }

    calcBtn.addEventListener('click', async () => {
        if (!originData || !destData) return;

        calcBtn.disabled = true;
        calcBtn.textContent = 'Calculating...';

        originCoordsEl.textContent = `${originData.lat.toFixed(6)}, ${originData.lng.toFixed(6)}`;
        destCoordsEl.textContent = `${destData.lat.toFixed(6)}, ${destData.lng.toFixed(6)}`;

        // Initialize distance map if needed
        if (!distanceMap) {
            distanceMap = createMap('distance-map');
            maps.distance = distanceMap;
        }

        // Clear previous
        distMarkers.forEach(m => distanceMap.removeLayer(m));
        distMarkers = [];
        if (routeLine) distanceMap.removeLayer(routeLine);

        // Fetch route from OSRM
        const coords = `${originData.lng},${originData.lat};${destData.lng},${destData.lat}`;
        try {
            const res = await fetch(`${OSRM_URL}/${coords}?overview=full&geometries=polyline`);
            const data = await res.json();

            if (data.code === 'Ok' && data.routes.length > 0) {
                const route = data.routes[0];
                const distKm = route.distance / 1000;

                distValue.textContent = distKm >= 1
                    ? `${distKm.toFixed(1)} km`
                    : `${Math.round(route.distance)} m`;
                durationValue.textContent = formatDuration(route.duration);

                // Decode and draw the actual route
                const routePoints = decodePolyline(route.geometry);
                routeLine = L.polyline(routePoints, {
                    color: '#3b82f6',
                    weight: 4,
                    opacity: 0.8,
                }).addTo(distanceMap);
            } else {
                // Fallback to straight line with haversine
                const dist = haversineDistance(originData.lat, originData.lng, destData.lat, destData.lng);
                distValue.textContent = dist >= 1
                    ? `${dist.toFixed(1)} km (straight line)`
                    : `${Math.round(dist * 1000)} m (straight line)`;
                durationValue.textContent = '—';

                routeLine = L.polyline([
                    [originData.lat, originData.lng],
                    [destData.lat, destData.lng],
                ], { color: '#3b82f6', weight: 3, dashArray: '8, 8' }).addTo(distanceMap);
            }
        } catch {
            // Fallback to straight line on network error
            const dist = haversineDistance(originData.lat, originData.lng, destData.lat, destData.lng);
            distValue.textContent = dist >= 1
                ? `${dist.toFixed(1)} km (straight line)`
                : `${Math.round(dist * 1000)} m (straight line)`;
            durationValue.textContent = '—';

            routeLine = L.polyline([
                [originData.lat, originData.lng],
                [destData.lat, destData.lng],
            ], { color: '#3b82f6', weight: 3, dashArray: '8, 8' }).addTo(distanceMap);
        }

        distResult.hidden = false;

        // Add markers
        const m1 = L.marker([originData.lat, originData.lng])
            .addTo(distanceMap)
            .bindPopup(`Origin<br>${originData.lat.toFixed(6)}, ${originData.lng.toFixed(6)}`);
        const m2 = L.marker([destData.lat, destData.lng])
            .addTo(distanceMap)
            .bindPopup(`Destination<br>${destData.lat.toFixed(6)}, ${destData.lng.toFixed(6)}`);
        distMarkers = [m1, m2];

        // Fit bounds
        const bounds = routeLine.getBounds();
        distanceMap.fitBounds(bounds, { padding: [50, 50] });

        calcBtn.disabled = false;
        calcBtn.textContent = 'Calculate';
    });
})();
