document.addEventListener('DOMContentLoaded', async () => {
    // Initialize map with canvas rendering
    const map = L.map('mapid', {
        preferCanvas: true,
        renderer: L.canvas()
    }).setView([20, 0], 2);

    // Add base tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Create panes for proper layering
    map.createPane('countries');
    map.getPane('countries').style.zIndex = 350;
    map.createPane('cities');
    map.getPane('cities').style.zIndex = 400;

    // Cached static files
    let geojsonData = null;
    let coordinatesData = null;

    // Dynamic layers / controls
    let allCountsData = {countries: {}, cities: {}};
    let countryLayer = null;
    const cityLayerGroup = L.layerGroup().addTo(map);
    let currentLegends = {legend: null, cityLegend: null};

    const minCount = 10; // Minimum count for filtering
    const cityRadius = 8;

    // Color helpers
    function getColor(d) {
        return d > 200 ? '#800026' :
               d > 100  ? '#BD0026' :
               d > 50   ? '#E31A1C' :
               d > 20   ? '#FC4E2A' :
               d > 10   ? '#FD8D3C' :
                          '#FFEDA0';
    }

    function getCityColor(d) {
        return d > 100 ? '#00441b' :
               d > 50  ? '#238b45' :
               d > 20  ? '#41ab5d' :
               d > 10  ? '#74c476' :
                          '#a1d99b';
    }

    function getCountryCode(feature) {
        if (!feature.properties) return null;
        if (feature.properties['ISO3166-1-Alpha-2']) return feature.properties['ISO3166-1-Alpha-2'].toLowerCase();
        if (feature.properties.iso_a2) return feature.properties.iso_a2.toLowerCase();
        if (feature.properties.adm0_a3) return feature.properties.adm0_a3.toLowerCase();
        if (feature.properties.name) return feature.properties.name.toLowerCase();
        return null;
    }

    function styleCountry(feature) {
        const countryCode = getCountryCode(feature);
        const count = countryCode ? (allCountsData.countries[countryCode] || 0) : 0;
        return {
            fillColor: getColor(count),
            weight: 1,
            opacity: 1,
            color: 'white',
            dashArray: '3',
            fillOpacity: 0.7
        };
    }

    function clearLayers() {
        if (countryLayer) {
            map.removeLayer(countryLayer);
            countryLayer = null;
        }
        cityLayerGroup.clearLayers();
        if (currentLegends.legend) currentLegends.legend.remove();
        if (currentLegends.cityLegend) currentLegends.cityLegend.remove();
        currentLegends = {legend: null, cityLegend: null};
    }

    function renderCounts() {
        clearLayers();

        // Countries
        try {
            countryLayer = L.geoJson(geojsonData, {
                pane: 'countries',
                style: styleCountry,
                onEachFeature: function (feature, layer) {
                    if (!feature?.properties) return;
                    const countryCode = getCountryCode(feature);
                    const count = countryCode ? (allCountsData.countries[countryCode] || 0) : 0;
                    if (count > minCount && feature.properties.name) {
                        layer.bindPopup(`<b>${feature.properties.name}</b><br>Nodes: ${count}`);
                    }
                }
            }).addTo(map);
        } catch (err) {
            console.error('Error rendering country layer:', err);
        }

        // Cities
        for (const city in allCountsData.cities) {
            const count = allCountsData.cities[city];
            if (count > minCount) {
                const coords = coordinatesData.cities[city];
                if (coords) {
                    const marker = L.circleMarker(coords, {
                        radius: cityRadius,
                        fillColor: getCityColor(count),
                        color: '#000',
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 1,
                        pane: 'cities'
                    });
                    marker.bindTooltip(`<b>${city}</b><br>Nodes: ${count}`, {permanent: false, direction: 'right'});
                    cityLayerGroup.addLayer(marker);
                }
            }
        }

        // Add legends
        currentLegends = addLegends(map, getColor, getCityColor, cityRadius);
        console.log('Map rendered for dataset');
    }

    // Load counts file and render
    async function loadCountsFile(path) {
        try {
            const resp = await fetch(path);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            allCountsData = await resp.json();
            // Basic validation
            allCountsData.countries = allCountsData.countries || {};
            allCountsData.cities = allCountsData.cities || {};
            renderCounts();
        } catch (err) {
            console.error('Error loading counts file', path, err);
        }
    }

    // Load static files (countries.geojson and coordinates.json) first
    try {
        const [geoResp, coordsResp] = await Promise.all([
            fetch('countries.geojson'),
            fetch('coordinates.json')
        ]);
        if (!geoResp.ok) throw new Error(`countries.geojson HTTP ${geoResp.status}`);
        if (!coordsResp.ok) throw new Error(`coordinates.json HTTP ${coordsResp.status}`);
        geojsonData = await geoResp.json();
        coordinatesData = await coordsResp.json();
    } catch (err) {
        console.error('Error fetching static map data:', err);
        return;
    }

    // Hook up UI control
    const datasetSelect = document.getElementById('dataset-select');
    const datasetFiles = {
        'mainnet': 'all_counts.json',
        'mainnet-testnet': 'all_counts-testnet.json'
    };

    datasetSelect.addEventListener('change', (e) => {
        const v = e.target.value;
        const file = datasetFiles[v] || datasetFiles['mainnet'];
        loadCountsFile(file);
    });

    // Initial load (default to mainnet)
    const initial = datasetSelect.value || 'mainnet';
    await loadCountsFile(datasetFiles[initial]);

    // Legend helper returns references so we can remove them later
    function addLegends(map, getColor, getCityColor, cityRadius) {
        // Country legend
        const legend = L.control({position: 'bottomright'});
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            const grades = [0, 10, 20, 50, 100, 200];
            div.innerHTML = '<b>Node Count</b><br>';
            for (let i = 0; i < grades.length; i++) {
                div.innerHTML +=
                    `<i style="background:${getColor(grades[i]+1)}"></i> ${grades[i]}${grades[i+1]? '&ndash;'+grades[i+1] : '+' }<br>`;
            }
            return div;
        };
        legend.addTo(map);

        // City legend
        const cityLegend = L.control({position: 'bottomleft'});
        cityLegend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info city-legend');
            const grades = [10, 20, 50, 100];
            div.innerHTML = '<b>City Node Count</b><br>';
            for (let i = 0; i < grades.length; i++) {
                div.innerHTML +=
                    `<i style="background:${getCityColor(grades[i]+1)};width:${cityRadius*2}px;height:${cityRadius*2}px;border-radius:50%"></i> ${grades[i]}${grades[i+1]? '&ndash;'+grades[i+1] : '+' }<br>`;
            }
            return div;
        };
        cityLegend.addTo(map);

        return {legend, cityLegend};
    }
});