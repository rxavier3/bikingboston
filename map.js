mapboxgl.accessToken = 'pk.eyJ1IjoicnhhdmllciIsImEiOiJjbTV2enFwczEwN3RiMm1xMm5nZnVmbThmIn0.YvArz8t8xpTGsktDwQ-_CQ';
const svg = d3.select('#map').select('svg');
let stations = [];
let circles;
let trips = [];
let timeFilter = -1; // Initialize time filter to -1 (no filtering)
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);


// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
  });
  
  // Add a move event listener to update circle positions
map.on('move', updatePositions);

// Select slider and display elements
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

// Helper function to format time
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

// Function to update the time display and filter data
function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value); // Get slider value

  if (timeFilter === -1) {
    selectedTime.textContent = ''; // Clear time display
    anyTimeLabel.style.display = 'block'; // Show "(any time)"
  } else {
    selectedTime.textContent = formatTime(timeFilter); // Display formatted time
    anyTimeLabel.style.display = 'none'; // Hide "(any time)"
  }

  // Filter trips and update the map
  filterTripsByTime();
  updateMap();
}

// Helper function to calculate minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Function to filter trips based on the selected time
function filterTripsByTime() {
  filteredTrips = timeFilter === -1
    ? trips
    : trips.filter((trip) => {
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });

  // Update filtered arrivals and departures
  filteredArrivals = d3.rollup(
    filteredTrips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  filteredDepartures = d3.rollup(
    filteredTrips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  // Update filtered stations
  filteredStations = stations.map((station) => {
    const id = station.short_name;
    station = { ...station }; // Clone the station object
    station.arrivals = filteredArrivals.get(id) ?? 0;
    station.departures = filteredDepartures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// Function to update the map with filtered data
function updateMap() {
  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
    .range(timeFilter === -1 ? [0, 10] : [1, 20]); // Adjust circle size based on filter

  circles = svg.selectAll('circle')
    .data(filteredStations, (d) => d.short_name) // Bind filtered data
    .join(
      (enter) => enter.append('circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.6)
        .each(function (d) {
          d3.select(this)
            .append('title')
            .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        }),
      (update) => update
        .attr('r', d => radiusScale(d.totalTraffic))
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) 
    );

  updatePositions();
}

// Function to update circle positions
function updatePositions() {
  if (circles) {
    circles
      .attr('cx', d => getCoords(d).cx)
      .attr('cy', d => getCoords(d).cy);
  }
}

// Helper function to get coordinates
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

// Initialize the slider event listener
timeSlider.addEventListener('input', updateTimeDisplay);

// Load data and initialize the map
map.on('load', () => {
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
  });
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6
    }
  });

  map.addSource('camb_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });
  map.addLayer({
    id: 'bike-lanes2',
    type: 'line',
    source: 'camb_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6
    }
  });

  const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
  const trafficurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

  Promise.all([d3.json(jsonurl), d3.csv(trafficurl)]).then(([jsonData, tripsData]) => {
    stations = jsonData.data.stations;

    // Convert date strings to Date objects
    trips = tripsData.map((trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    });

    // Initialize filtered data
    filterTripsByTime();
    updateMap();

    // Set initial display state
    updateTimeDisplay();
  }).catch(error => {
    console.error('Error loading data:', error);
  });
});