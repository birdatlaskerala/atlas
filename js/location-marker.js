var GeoLocationMarker = GeoLocationMarker || (function() {

        var getLocationMarkers = [],
            locationError = false,
            successCallback = function(position) {
                _.each(getLocationMarkers, function(getLocationMarker){
                    getLocationMarker.setPosition(position);
                });
            },
            errorCallback = function(positionError) {
                locationError = true;
            },

            watchId = function() {
                if (navigator.geolocation) {
                    return navigator.geolocation.watchPosition(
                        successCallback,
                        errorCallback,
                        {
                            enableHighAccuracy: true,
                            timeout: 2000,
                            maximumAge: 5000
                        });
                }
                return null;
            }(),

            GeoLocationMarker = function() {
                getLocationMarkers.push(this);
            };

        GeoLocationMarker.prototype = {
            marker : new google.maps.Marker({
                'clickable': false,
                'cursor': 'pointer',
                'draggable': false,
                'flat': true,
                'icon' : {
                    'url' : 'images/flashball.gif',
                    'size': new google.maps.Size(16, 16),
                    'scaledSize': new google.maps.Size(16, 16),
                    'origin': new google.maps.Point(0, 0),
                    'anchor': new google.maps.Point(8, 8)
                },
                'optimized': false,
                'position': new google.maps.LatLng(0, 0),
                'title': "I'm Here",
                'zIndex': 2
            }),

            setMap: function(map) {
                this.marker.setMap(map);
            },

            setPosition: function(position) {
                this.marker.setPosition({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },

            isLocationAvailable: function() {
                return watchId != null && !locationError;
            },

            panMapToCurrentPosition: function() {
                var map = this.marker.getMap(),
                    position = this.marker.getPosition();
                if (map && position) {
                    map.panTo(position);
                }
            }
        };

        return {
            GeoLocationMarker : GeoLocationMarker
        };
    })();