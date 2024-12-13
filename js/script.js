const map = L.map('map').setView([51.9607, 7.6261], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

const orsApiKey = orsApiKeyhidden; // replace with YOUR!!! ORS API key
const orsBaseUrl = 'https://api.openrouteservice.org/v2/directions/';

let poiMarkers = [];
let poiList = [];

function displayError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}
// fetch pois from overpass api
async function fetchPOIs() {
    poiMarkers.forEach(marker => map.removeLayer(marker));
    poiMarkers = [];
    poiList = [];
    document.getElementById('poi-list').innerHTML = '';
    
    // 10 km radius, add feaure to dynmaically change radius TODO
    const query = `
        [out:json];
        (node["tourism"~"museum|attraction|viewpoint"](around:10000, 51.9607, 7.6261););
        out body;
    `;

    try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await response.json();

        // Log the entire JSON response to console
        console.log('full api response:', data);

        if (!data.elements?.length) return displayError('no POIs found in this area.');

        const uniquePOIs = new Map();
        data.elements.forEach(({ tags, lat, lon }) => {
            if (!tags?.name || uniquePOIs.has(tags.name)) return;

            const marker = L.marker([lat, lon]).addTo(map).bindPopup(tags.name);
            poiMarkers.push(marker);
            poiList.push({ name: tags.name, lat, lon, type: tags.tourism });

            const poiItem = document.createElement('div');
            poiItem.innerHTML = `<label><input type="checkbox" data-index="${poiList.length - 1}"> ${tags.name} (${tags.tourism})</label>`;
            document.getElementById('poi-list').appendChild(poiItem);

            uniquePOIs.set(tags.name, true);
        });

    } catch (error) {
        displayError(`error fetching POIs: ${error.message}`);
    }
}
// create route from selected pois
async function createRoute() {
    const selectedPOIs = Array.from(document.querySelectorAll('input:checked')).map(input => poiList[input.dataset.index]);
    if (selectedPOIs.length < 2) return displayError('please select atleast 2 POIs for routing');

    const body = JSON.stringify({
        coordinates: selectedPOIs.map(({ lon, lat }) => [lon, lat]),
        preference: 'shortest'
    });

    try {
        const response = await fetch(orsBaseUrl + document.getElementById('transport-mode').value, {
            method: 'POST',
            headers: {
                'Authorization': orsApiKey,
                'Content-Type': 'application/json'
            },
            body
        });

        if (!response.ok) return displayError(`route error: ${response.statusText}`);
        const routeData = await response.json();

        // Log the ENTIRE route response to console
        console.log('Full Route API Response:', JSON.stringify(routeData, null, 2));

        if (!routeData.routes?.length) return displayError('no route found. unable to generate path...');

        const route = routeData.routes[0];
        
        // Convert distance to kilometers and duration to hours/minutes
        const distanceKm = (route.summary.distance / 1000).toFixed(1);
        const durationHours = Math.floor(route.summary.duration / 3600);
        const durationMinutes = Math.round((route.summary.duration % 3600) / 60);

        // Collect ALL steps from ALL segments
        const allSteps = route.segments.flatMap(segment => segment.steps);

        // Create route details display
        const routeDetailsDiv = document.getElementById('route-details') || document.createElement('div');
        routeDetailsDiv.id = 'route-details';
        
        // Generate a list of ALL steps
        const stepsHtml = allSteps.map((step, index) => `
            <li>
                <strong>Step ${index + 1}:</strong> 
                ${step.instruction} 
                (Distance: ${(step.distance / 1000).toFixed(2)} km, 
                Duration: ${(step.duration / 60).toFixed(1)} mins)
            </li>
        `).join('');

        routeDetailsDiv.innerHTML = `
            <h3>Route Details</h3>
            <p><strong>Total Distance:</strong> ${distanceKm} km</p>
            <p><strong>Total Duration:</strong> ${durationHours} hours ${durationMinutes} minutes</p>
            <h4>Detailed Route Steps:</h4>
            <ul>${stepsHtml}</ul>
        `;
        
        // Ensure the div is added to the document
        if (!document.getElementById('route-details')) {
            document.body.appendChild(routeDetailsDiv);
        }

        map.eachLayer(layer => layer instanceof L.Polyline && map.removeLayer(layer));
        const routeLine = L.polyline(L.Polyline.fromEncoded(route.geometry).getLatLngs(), { color: 'blue', weight: 5, opacity: 0.7 }).addTo(map);
        map.fitBounds(routeLine.getBounds());

        const [start, end] = [selectedPOIs[0], selectedPOIs[selectedPOIs.length - 1]];
        [start, end].forEach(({ lat, lon }, i) => L.marker([lat, lon], {
            icon: L.divIcon({
                html: `<div style="background-color: ${i ? 'red' : 'green'}; width: 20px; height: 20px; border-radius: 50%;"></div>`,
                iconSize: [20, 20]
            })
        }).addTo(map));

    } catch (error) {
        displayError(`routing error: ${error.message}`);
    }
}
// what the fuck
L.Polyline.fromEncoded = encoded => {
    let lat = 0, lng = 0, coordinates = [],
        shift = 0, result = 0, b, index = 0;

    while (index < encoded.length) {
        shift = result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result & 1 ? ~(result >> 1) : (result >> 1));

        shift = result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result & 1 ? ~(result >> 1) : (result >> 1));

        coordinates.push(L.latLng(lat * 1e-5, lng * 1e-5));
    }

    return new L.Polyline(coordinates);
};

document.getElementById('create-route').addEventListener('click', createRoute);
fetchPOIs();