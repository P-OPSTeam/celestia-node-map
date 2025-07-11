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

    map.whenReady(async () => {
        // Create panes for proper layering
        map.createPane('countries');
        map.getPane('countries').style.zIndex = 350;
        map.createPane('cities');
        map.getPane('cities').style.zIndex = 400;

        let allCountsData;
        let coordinatesData;

        try {
            const [countsResponse, coordsResponse] = await Promise.all([
                fetch('all_counts.json'),
                fetch('coordinates.json')
            ]);

            allCountsData = await countsResponse.json();
            coordinatesData = await coordsResponse.json();
        } catch (error) {
            console.error('Error fetching data:', error);
            return;
        }

        const minCount = 10; // Minimum count for filtering

        // Function to get color based on count for countries
        function getColor(d) {
            return d > 200 ? '#800026' :
                   d > 100  ? '#BD0026' :
                   d > 50   ? '#E31A1C' :
                   d > 20   ? '#FC4E2A' :
                   d > 10   ? '#FD8D3C' :
                              '#FFEDA0';
        }

        // Function to get color based on count for cities
        function getCityColor(d) {
            return d > 100 ? '#00441b' :
                   d > 50  ? '#238b45' :
                   d > 20  ? '#41ab5d' :
                   d > 10  ? '#74c476' :
                              '#a1d99b';
        }

        // Function to get country code from GeoJSON
        function getCountryCode(feature) {
            if (!feature.properties) return null;
            if (feature.properties['ISO3166-1-Alpha-2']) return feature.properties['ISO3166-1-Alpha-2'].toLowerCase();
            if (feature.properties.iso_a2) return feature.properties.iso_a2.toLowerCase();
            if (feature.properties.adm0_a3) return feature.properties.adm0_a3.toLowerCase();
            if (feature.properties.name) return feature.properties.name.toLowerCase();
            return null;
        }

        // Function to style countries
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

        // Load and process countries GeoJSON
        fetch('countries.geojson')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(geojsonData => {
                if (!geojsonData?.features?.length) {
                    throw new Error('Invalid or empty GeoJSON data');
                }

                // Add country layer
                L.geoJson(geojsonData, {
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

                // Process cities after countries
                const cityRadius = 8;
                for (const city in allCountsData.cities) {
                    const count = allCountsData.cities[city];
                    if (count > minCount) {
                        const coords = coordinatesData.cities[city];
                        if (coords) {
                            L.circleMarker(coords, {
                                radius: cityRadius,
                                fillColor: getCityColor(count),
                                color: '#000',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 1,
                                pane: 'cities'
                            }).addTo(map).bindTooltip(`<b>${city}</b><br>Nodes: ${count}`, {
                                permanent: false,
                                direction: 'right'
                            });
                        }
                    }
                }

                // Add legends
                addLegends(map, getColor, getCityColor, cityRadius);
                console.log('Map loaded successfully');
            })
            .catch(error => {
                console.error('Error loading GeoJSON:', error);
            });
    });

    function addLegends(map, getColor, getCityColor, cityRadius) {
        // Country legend
        const legend = L.control({position: 'bottomright'});
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            const grades = [0, 10, 20, 50, 100, 200];
            div.innerHTML = '<b>Node Count</b><br>';
            for (let i = 0; i < grades.length; i++) {
                div.innerHTML +=
                    `<i style="background:${getColor(grades[i]+1)}"></i> ${grades[i]}${grades[i+1]?'&ndash;'+grades[i+1]:'+'}<br>`;
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
                    `<i style="background:${getCityColor(grades[i]+1)};width:${cityRadius*2}px;height:${cityRadius*2}px;border-radius:50%"></i> ${grades[i]}${grades[i+1]?'&ndash;'+grades[i+1]:'+'}<br>`;
            }
            return div;
        };
        cityLegend.addTo(map);
    }
});