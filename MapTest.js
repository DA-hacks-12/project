(() => {
	const preview = document.querySelector("#map-preview");
	const label = document.querySelector("#preview-label");
	const radiusInput = document.querySelector("#radius-miles");
	const findButton = document.querySelector("#find-location");
	const searchStatus = document.querySelector("#search-status");
	const suggestions = document.querySelector("#suggestions");
	const metersPerMile = 1609.344;
	let map;
	let marker;
	let startMarker;
	let routeLayer;
	let currentLat = null;
	let currentLon = null;

	function getLocation(target) {
		return target instanceof Element ? target.closest("[data-map-location]") : null;
	}

	function updateLocationLink(location) {
		const latitude = Number(location.dataset.lat);
		const longitude = Number(location.dataset.lon);

		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

		if (currentLat !== null && currentLon !== null) {
			location.href = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${currentLat}%2C${currentLon}%3B${latitude}%2C${longitude}#map=15/${latitude}/${longitude}`;
		} else {
			location.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
		}
		return true;
	}

	function positionPreview(event) {
		const margin = 12;
		const offset = 18;
		const bounds = preview.getBoundingClientRect();
		let left = event.clientX + offset;
		let top = event.clientY + offset;

		if (left + bounds.width > window.innerWidth - margin) {
			left = event.clientX - bounds.width - offset;
		}
		if (top + bounds.height > window.innerHeight - margin) {
			top = event.clientY - bounds.height - offset;
		}

		preview.style.left = `${Math.max(margin, left)}px`;
		preview.style.top = `${Math.max(margin, top)}px`;
	}

	async function showPreview(location, event) {
		const latitude = Number(location.dataset.lat);
		const longitude = Number(location.dataset.lon);
		const name = location.dataset.name;

		if (!name || !updateLocationLink(location)) return;

		label.textContent = name;
		preview.setAttribute("aria-hidden", "false");
		preview.classList.add("is-visible");
		if (event) {
			positionPreview(event);
		} else {
			const bounds = location.getBoundingClientRect();
			positionPreview({
				clientX: bounds.left + bounds.width / 2,
				clientY: bounds.top + bounds.height / 2
			});
		}

		const destLatLng = [latitude, longitude];

		if (!map) {
			map = L.map("preview-map", {
				attributionControl: true,
				boxZoom: false,
				doubleClickZoom: false,
				dragging: false,
				keyboard: false,
				scrollWheelZoom: false,
				zoomControl: false
			}).setView(destLatLng, 15);

			L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
				maxZoom: 19,
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
			}).addTo(map);
			marker = L.marker(destLatLng).addTo(map);
		} else {
			map.setView(destLatLng, 15);
			marker.setLatLng(destLatLng);
		}

		// Draw start marker and walking route if device position is known
		if (currentLat !== null && currentLon !== null) {
			const startLatLng = [currentLat, currentLon];
			if (!startMarker) {
				startMarker = L.marker(startLatLng, {
					icon: L.divIcon({
						className: 'start-marker',
						html: '<div style="background: #17664e; width: 12px; height: 12px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>',
						iconSize: [12, 12],
						iconAnchor: [6, 6]
					})
				}).addTo(map);
			} else {
				startMarker.setLatLng(startLatLng);
			}

			try {
				// Walking: OpenStreetMap's own foot router. The public OSRM demo ignores
				// "foot" and answers with the driving route.
				const response = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${currentLon},${currentLat};${longitude},${latitude}?overview=full&geometries=geojson`);
				if (response.ok) {
					const data = await response.json();
					if (data.routes && data.routes.length > 0) {
						const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
						if (routeLayer) {
							routeLayer.setLatLngs(coords);
						} else {
							routeLayer = L.polyline(coords, { color: '#17664e', weight: 4, opacity: 0.8 }).addTo(map);
						}
						map.fitBounds(L.polyline(coords).getBounds(), { padding: [20, 20] });
					}
				}
			} catch (e) {
				if (routeLayer) {
					map.removeLayer(routeLayer);
					routeLayer = null;
				}
			}
		} else {
			if (routeLayer) {
				map.removeLayer(routeLayer);
				routeLayer = null;
			}
			if (startMarker) {
				map.removeLayer(startMarker);
				startMarker = null;
			}
		}

		window.requestAnimationFrame(() => map.invalidateSize());
	}

	function hidePreview() {
		preview.classList.remove("is-visible");
		preview.setAttribute("aria-hidden", "true");
	}

	function getDevicePosition() {
		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: false,
				timeout: 15000,
				maximumAge: 300000
			});
		});
	}

    function getOverpassQuery(latitude, longitude, radiusMeters) {
		const radiusMiles = radiusMeters / metersPerMile;
		const latitudeDelta = radiusMiles / 69.0;
		const longitudeDelta = Math.min(
			180,
			radiusMiles / (69.172 * Math.max(Math.cos(latitude * Math.PI / 180), 0.05))
		);
		const south = Math.max(-90, latitude - latitudeDelta);
		const north = Math.min(90, latitude + latitudeDelta);
		const west = Math.max(-180, longitude - longitudeDelta);
		const east = Math.min(180, longitude + longitudeDelta);

		return `[out:json][timeout:25];
(
  nwr(around:${radiusMeters},${latitude},${longitude})[leisure~"^(park|nature_reserve)$"];
)->.places;
way(${south},${west},${north},${east})[highway~"^(path|footway|track|bridleway)$"][name]->.trails;
.places out tags center;
.trails out tags center;`;
	}

	function haversineMiles(firstLat, firstLon, secondLat, secondLon) {
		const radians = Math.PI / 180;
		const latitudeDelta = (secondLat - firstLat) * radians;
		const longitudeDelta = (secondLon - firstLon) * radians;
		const haversine = Math.sin(latitudeDelta / 2) ** 2
			+ Math.cos(firstLat * radians) * Math.cos(secondLat * radians)
			* Math.sin(longitudeDelta / 2) ** 2;

		return 3958.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
	}

	function getPlaceCoordinate(element, latitude, longitude) {
		const placeLatitude = element.lat ?? element.center?.lat;
		const placeLongitude = element.lon ?? element.center?.lon;
		if (!Number.isFinite(placeLatitude) || !Number.isFinite(placeLongitude)) return null;

		return {
			lat: placeLatitude,
			lon: placeLongitude,
			distanceMiles: haversineMiles(latitude, longitude, placeLatitude, placeLongitude)
		};
	}

	async function fetchNearbyPlaces(latitude, longitude, radiusMiles) {
		const query = getOverpassQuery(latitude, longitude, Math.round(radiusMiles * metersPerMile));
		const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
			headers: { Accept: "application/json" }
		});

		if (!response.ok) throw new Error("The OpenStreetMap place search is temporarily unavailable.");

		const data = await response.json();
		const uniquePlaces = new Map();

		data.elements.forEach((element) => {
			const name = element.tags?.name;
			if (!name) return;

			const coordinate = getPlaceCoordinate(element, latitude, longitude);
			if (!coordinate || coordinate.distanceMiles > radiusMiles) return;

			uniquePlaces.set(`${element.type}/${element.id}`, {
				name,
				lat: coordinate.lat,
				lon: coordinate.lon,
				distanceMiles: coordinate.distanceMiles
			});
		});

		return [...uniquePlaces.values()];
	}

	function renderSuggestions(places) {
		suggestions.replaceChildren();
		if (places.length === 0) return;

		const fragment = document.createDocumentFragment();
		places.forEach((place) => {
			const item = document.createElement("li");
			const link = document.createElement("a");
			link.className = "map-location";
			link.dataset.mapLocation = "";
			link.dataset.lat = place.lat;
			link.dataset.lon = place.lon;
			link.dataset.name = place.name;
			link.href = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=15/${place.lat}/${place.lon}`;
			link.textContent = `${place.name} (${place.distanceMiles.toFixed(1)} mi)`;
			item.append(link);
			fragment.append(item);
		});
		suggestions.append(fragment);
	}

	async function findNearbyPlacesAction() {
		const radiusMiles = radiusInput.valueAsNumber;
		if (!Number.isFinite(radiusMiles) || radiusMiles < 1 || radiusMiles > 50) {
			searchStatus.textContent = "Enter a search radius from 1 to 50 miles.";
			return;
		}
		if (!navigator.geolocation) {
			searchStatus.textContent = "Device location is not available in this browser.";
			return;
		}

		findButton.disabled = true;
		findButton.textContent = "Searching...";
		suggestions.replaceChildren();
		searchStatus.textContent = "Getting your location and querying OpenStreetMap...";

		try {
			const position = await getDevicePosition();
			currentLat = position.coords.latitude;
			currentLon = position.coords.longitude;

			const places = await fetchNearbyPlaces(currentLat, currentLon, radiusMiles);

			if (places.length === 0) {
				searchStatus.textContent = `No named parks, trails, or POIs found within ${radiusMiles} miles.`;
				return;
			}

			// Sort by closest distance first
			places.sort((a, b) => a.distanceMiles - b.distanceMiles);

			renderSuggestions(places);
			searchStatus.textContent = `Found ${places.length} places within ${radiusMiles} miles:`;
		} catch (error) {
			if (error.code === 1) {
				searchStatus.textContent = "Location access was denied. Allow location access and try again.";
			} else if (error.code === 2 || error.code === 3) {
				searchStatus.textContent = "Could not determine your location. Check device location settings and try again.";
			} else {
				searchStatus.textContent = error.message || "Could not search for nearby places. Please try again.";
			}
		} finally {
			findButton.disabled = false;
			findButton.textContent = "Find nearby places";
		}
	}

	document.addEventListener("pointerover", (event) => {
		const location = getLocation(event.target);
		if (location && !(event.relatedTarget instanceof Node && location.contains(event.relatedTarget))) {
			showPreview(location, event);
		}
	});

	document.addEventListener("pointermove", (event) => {
		if (getLocation(event.target)) positionPreview(event);
	});

	document.addEventListener("pointerout", (event) => {
		const location = getLocation(event.target);
		if (location && !(event.relatedTarget instanceof Node && location.contains(event.relatedTarget))) {
			hidePreview();
		}
	});

	document.addEventListener("focusin", (event) => {
		const location = getLocation(event.target);
		if (location) showPreview(location);
	});

	document.addEventListener("focusout", (event) => {
		const location = getLocation(event.target);
		if (location && !(event.relatedTarget instanceof Node && location.contains(event.relatedTarget))) {
			hidePreview();
		}
	});

	document.addEventListener("click", (event) => {
		const location = getLocation(event.target);
		if (location) updateLocationLink(location);
	});

	findButton.addEventListener("click", findNearbyPlacesAction);
})();