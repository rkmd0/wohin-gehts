document.addEventListener('DOMContentLoaded', () => { 
    const map = L.map('map').setView([51.9607, 7.6261], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    const orsApiKey = orsApiKeyhidden; // replace with YOUR!!! ORS API key
    const orsBaseUrl = 'https://api.openrouteservice.org/v2/directions/';

    let poiMarkers = [];
    let poiList = [];

    // Define custom marker colors for different POI types
    const poiTypeColors = {
        'museum': 'blue',
        'attraction': 'green',
        'viewpoint': 'red'
    };

    // Create custom marker icon based on POI type
    function createMarkerIcon(type) {
        const color = poiTypeColors[type] || 'gray';
        return L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color:${color}; width:20px; height:20px; border-radius:50%; border:2px solid white;"></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
    }

    // Add POI type filter to route-options div
    const routeOptionsDiv = document.getElementById('route-options');
    const poiTypeFilterSelect = document.createElement('select');
    poiTypeFilterSelect.id = 'poi-type-filter';
    poiTypeFilterSelect.innerHTML = `
        <option value="all">All POI Types</option>
        <option value="museum">Museums Only</option>
        <option value="attraction">Attractions Only</option>
        <option value="viewpoint">Viewpoints Only</option>
    `;
    routeOptionsDiv.appendChild(poiTypeFilterSelect);

    // Add type consistency checkbox
    const enforceTypeCheckbox = document.createElement('input');
    enforceTypeCheckbox.type = 'checkbox';
    enforceTypeCheckbox.id = 'enforce-type';
    const enforceTypeLabel = document.createElement('label');
    enforceTypeLabel.appendChild(enforceTypeCheckbox);
    enforceTypeLabel.appendChild(document.createTextNode('Enforce Same POI Type'));
    routeOptionsDiv.appendChild(enforceTypeLabel);

    function displayError(message) {
        console.error(message);  // Always log errors to console
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    // Updated fetchPOIs function with type filtering and custom markers
    async function fetchPOIs() {
        // Clear existing markers and list
        poiMarkers.forEach(marker => map.removeLayer(marker));
        poiMarkers = [];
        poiList = [];
        document.getElementById('poi-list').innerHTML = '';
        
        // Get selected POI type from dropdown
        const poiTypeFilter = document.getElementById('poi-type-filter').value;
        
        // Dynamically construct the Overpass API query based on selected type
        const typeQuery = poiTypeFilter === 'all' 
            ? '"tourism"~"museum|attraction|viewpoint"' 
            : `"tourism"="${poiTypeFilter}"`;
        
        const query = `
            [out:json];
            (node[${typeQuery}](around:10000, 51.9607, 7.6261););
            out body;
        `;

        try {
            const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
            const data = await response.json();

            // Log the entire JSON response to console
            console.log('Full API response:', data);

            if (!data.elements?.length) return displayError('No POIs found in this area for the selected type.');

            const uniquePOIs = new Map();
            data.elements.forEach(({ tags, lat, lon }, index) => {
                if (!tags?.name || uniquePOIs.has(tags.name)) return;

                // Create custom marker with type-specific color
                const marker = L.marker([lat, lon], {
                    icon: createMarkerIcon(tags.tourism)
                }).addTo(map);

                // Store the index when the marker is created
                const poiIndex = poiList.length;

                // Create popup with name and "Add to Route" button
                marker.bindPopup(`
                    <div class="poi-popup">
                        <b>${tags.name}</b><br>
                        Type: ${tags.tourism}<br>
                        <button class="add-to-route-btn" data-index="${poiIndex}">
                            ${document.querySelector(`input[data-index="${poiIndex}"]`)?.checked ? 'Remove from Route' : 'Add to Route'}
                        </button>
                    </div>
                `);

                // Add click event to popup button
                marker.on('popupopen', function() {
                    // Find the button within THIS specific popup
                    const popupContent = this._popup._container;
                    const addButton = popupContent.querySelector('.add-to-route-btn');
                    
                    if (addButton) {
                        // Use a unique event listener for this specific button
                        const clickHandler = (event) => {
                            const index = addButton.dataset.index;
                            const checkbox = document.querySelector(`input[data-index="${index}"]`);
                            
                            if (checkbox) {
                                // Toggle the checkbox
                                checkbox.checked = !checkbox.checked;
                                addButton.textContent = checkbox.checked ? 'Remove from Route' : 'Add to Route';
                                // Log debugging information
                                console.log(`Toggled POI: ${poiList[index].name}`, {
                                    index: index,
                                    type: poiList[index].type,
                                    checked: checkbox.checked
                                });
                                
                                // Log all currently selected POIs
                                const selectedPOIs = Array.from(document.querySelectorAll('input:checked'))
                                    .map(input => poiList[input.dataset.index]);
                                console.log('Currently Selected POIs:', selectedPOIs);
                            }
                            
                            // Prevent event propagation and default behavior
                            event.stopPropagation();
                            event.preventDefault();
                        };
                        
                        // Remove any existing listeners to prevent multiple triggers
                        addButton.removeEventListener('click', clickHandler);
                        addButton.addEventListener('click', clickHandler);
                    }
                });

                poiMarkers.push(marker);
                poiList.push({ name: tags.name, lat, lon, type: tags.tourism });

                const poiItem = document.createElement('div');
                poiItem.innerHTML = `
                    <label>
                        <input 
                            type="checkbox" 
                            data-index="${poiList.length - 1}"
                            onclick="console.log('Checkbox clicked', this.checked, poiList[this.dataset.index])"
                        > ${tags.name} (${tags.tourism})
                    </label>
                `;
                document.getElementById('poi-list').appendChild(poiItem);

                uniquePOIs.set(tags.name, true);
            });

        } catch (error) {
            displayError(`Error fetching POIs: ${error.message}`);
        }
    }


    // Modify createRoute to enforce type consistency if checkbox is checked
    async function createRoute() {
        const selectedPOIs = Array.from(document.querySelectorAll('input:checked'))
            .map(input => poiList[input.dataset.index]);
        
        // Debug logging
        console.log('Route Creation - Selected POIs:', selectedPOIs);
        
        if (selectedPOIs.length < 2) return displayError('please select at least 2 POIs for routing');

        // Check if type consistency is required
        const enforceTypeConsistency = document.getElementById('enforce-type').checked;
        if (enforceTypeConsistency) {
            const firstType = selectedPOIs[0].type;
            const typeConsistent = selectedPOIs.every(poi => poi.type === firstType);
            
            if (!typeConsistent) {
                return displayError('When type consistency is enforced, all selected POIs must be of the same type');
            }
        }

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
            const routeDetailsDiv = document.getElementById('route-details');
            
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
    // polyine  encoding
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

    // Add event listeners
    document.getElementById('poi-type-filter').addEventListener('change', fetchPOIs);
    document.getElementById('create-route').addEventListener('click', createRoute);

    // Initial POI fetch
    fetchPOIs();
});