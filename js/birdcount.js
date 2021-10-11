/**
 * Author vj
 * Licensed under MIT license.
 */
const BirdCount = (function () {
    const $ = jQuery, //wp noConflicts $. Capture $ in this scope
        CELL_PATTERN = /([A-Z]+)(\d+)/,
        REVIEWED_PATTERN = ['yes', 'y', 'reviewed'],
        infoBoxTemplate = _.template('<span><b><%=clusterName%></b></span>' +
            '<%if (site && !_.isEmpty(site.trim())){%><br/><b>Site</b>: <%=site%><%}%>' +
            '<%if (owner && !_.isEmpty(owner.trim())){%><br/><b>Owner</b>: <%=owner%><%}%>' +
            '<%if (!_.isEmpty(listUrl["1"])){%><br/><a target="_blank" href="<%=listUrl["1"]%>">List1</a><%}%>' +
            '<%if (!_.isEmpty(listUrl["2"])){%> <a target="_blank" href="<%=listUrl["2"]%>">List2</a><%}%>' +
            '<%if (!_.isEmpty(listUrl["3"])){%> <a target="_blank" href="<%=listUrl["3"]%>">List3</a><%}%>' +
            '<%if (!_.isEmpty(listUrl["4"])){%> <a target="_blank" href="<%=listUrl["4"]%>">List4</a><%}%>'),
        kmlDescription = _.template('<%if (owner && !_.isEmpty(owner.trim())){%><b>Owner</b>: <%=owner%><%}%>' +
            '<%if (!_.isEmpty(listUrl["1"])){%><br/><a target="_blank" href="<%=listUrl["1"]%>">List1</a><%}%>' +
            '<%if (!_.isEmpty(listUrl["2"])){%><br/><a target="_blank" href="<%=listUrl["2"]%>">List2</a><%}%>' +
            '<%if (!_.isEmpty(listUrl["3"])){%><br/><a target="_blank" href="<%=listUrl["3"]%>">List3</a><%}%>' +
            '<%if (!_.isEmpty(listUrl["4"])){%><br/><a target="_blank" href="<%=listUrl["4"]%>">List4</a><%}%>'),
        customMapControlTemplate = _.template('<div class="settings-dropdown dropdown"> \
              <button class="btn btn-default dropdown-toggle" type="button" data-toggle="dropdown"> \
                <span class="glyphicon glyphicon-menu-hamburger"></span></button> \
              <ul class="dropdown-menu dropdown-menu-right"> \
                <li><button type="button" class="btn btn-sm exportKmlBtn" title="Export"><span class="glyphicon glyphicon-download-alt"></span></button> \
                    <%if (locationAvailable){%><button type="button" class="btn btn-sm gotoCurrentLocation" title="Go to Current Location"><span class="glyphicon glyphicon-record"></span></button><%}%> \
                    <button type="button" class="btn btn-sm districtCenter" title="Re-Centre"><span class="glyphicon glyphicon-flag"></span></button> \
                </li> \
                <%if (locationAvailable){%><li><label><input type="checkbox" class="locationChkBox"/> Show Location</label></li><%}%> \
                <li><label><input type="checkbox" class="clusterChkBox"/> Show Clusters</label></li> \
              </ul> \
            </div>'),

        NS_KML = 'http://www.opengis.net/kml/2.2',
        NS_GX = 'http://www.google.com/kml/ext/2.2',

        RectangleInfo = function (options) {
            this.options = _.extend({
                subCell: null,
                bounds: null,
                clusterName: null,
                site: null,
                owner: null,
                listUrl: {},
                reviewed: 'no',
                priority: null,
                status: 0
            }, options);
        },

        BirdMap = function (options) {
            this.options = _.extend({
                zoom: 12,
                mapContainerId: 'map-canvas',
                mapSpreadSheetId: null,
                name: 'visualization'
            }, options);

            if (!this.options.mapSpreadSheetId) {
                throw "the option 'mapSpreadSheetId' is mandatory";
            }
        };

    RectangleInfo.prototype = {
        setValue: function (name, value) {
            this.options[name] = value;
        },

        getValue: function (name) {
            return this.options[name];
        },

        isReviewed: function () {
            return this.getValue('reviewed')
                ? _.indexOf(REVIEWED_PATTERN, this.getValue('reviewed').toLowerCase()) >= 0
                : false;
        },

        getStrokeWeight: function () {
            if (this.isReviewed()) {
                return 1;
            }

            switch (this.getValue('priority')) {
                case 'Highest':
                    return 4;
                case 'High':
                    return 4;
                default:
                    return 1;
            }

        },

        getFillColor: function () {
            if (this.isReviewed()) {
                return '#ba33ff';
            }

            switch (this.getValue('status')) {
                case '1':
                    return '#B0B0B0';
                case '2':
                    return '#808080';
                case '3':
                    return '#505050';
                case '4':
                    return '#202020';
                default:
                    return '#FF8040';
            }
        },

        getFillOpacity: function () {
            return '0.60';
        }
    };

    BirdMap.prototype = {
        options: null,
        map: null,
        center: null,
        rectangleInfos: {},
        showCluster: false,
        clusterPolygons: null,
        labels: [],
        infoBox: new google.maps.InfoWindow(),
        customMapControls: null,
        geoLocation: new GeoLocationMarker.GeoLocationMarker(),

        getSheetData: function (page, sheetData, sheetDataKey, drawMapAfter) {
            $.ajax({
                url: this.getMapDataUrl(page),
                jsonp: "callback",
                dataType: "jsonp",
                context: this,
                success: function (response) {
                    if (response.error) {
                        const message = response.error.code === 403
                            ? "The application does not have access to district data."
                            : response.error.message;
                        this.options.alert(message);
                        return;
                    }
                    sheetData[sheetDataKey] = this._parseRows(response.values);
                    drawMapAfter();
                }
            });
        },

        render: function () {
            const sheetData = {},
                drawMapAfter = _.after(3, _.bind(this.drawMap, this, sheetData));

            this.getSheetData("Coordinates", sheetData, "coordinates", drawMapAfter);
            this.getSheetData("Birds Lists", sheetData, "status", drawMapAfter);
            this.getSheetData("Planning", sheetData, "planning", drawMapAfter);
        },

        drawMap: function (sheetData) {
            this.processCoordinates(sheetData['coordinates']);
            this.processStatusData(sheetData['status']);
            this.processPlanningData(sheetData['planning']);
        },

        recenter: function () {
            if (this.map) {
                google.maps.event.trigger(this.map, 'resize');
                this.map.setCenter(this.center);
            }
        },

        processCoordinates: function (rows) {
            this.map = this._createMap(rows);
            this.rectangleInfos = this._createRectangleInfo(rows);
            google.maps.event.addListenerOnce(this.map, 'idle', _.bind(function () {
                $('#' + this.options.mapContainerId).removeClass("spinner");
            }, this));
        },

        createClusterBoundaries: function () {
            return _.chain(this.rectangleInfos)
                .filter(function (rectangleInfo) {
                    //exclude forest cells
                    return rectangleInfo.getValue('clusterName') != 'F';
                })
                .groupBy(function (rectangleInfo) {
                    return rectangleInfo.getValue('clusterName');
                })
                .map(function (rectanglesInCluster, clusterName) {
                    const latLongs = [];
                    _.each(rectanglesInCluster, function (rectangle) {
                        const bounds = rectangle.getValue('bounds'),
                            ne = bounds.getNorthEast(),
                            sw = bounds.getSouthWest(),
                            nw = new google.maps.LatLng(ne.lat(), sw.lng()),
                            se = new google.maps.LatLng(sw.lat(), ne.lng());
                        latLongs.push(sw, nw, se, ne);
                    });
                    return {
                        clusterName: clusterName,
                        polygon: new google.maps.Polygon({
                            map: this.map,
                            paths: this.convexHull(latLongs),
                            fillColor: "#FF0000",
                            strokeWeight: 1,
                            fillOpacity: 0.10,
                            strokeColor: "#0000FF",
                            strokeOpacity: 0.25,
                            zIndex: -1000,
                            clickable: false
                        })
                    };
                }, this)
                .value();
        },

        _createMap: function (rows) {
            const bounds = new google.maps.LatLngBounds();
            _(rows).each(function (row) {
                bounds.extend(new google.maps.LatLng(row[2], row[1]));
                bounds.extend(new google.maps.LatLng(row[6], row[5]));
            });
            this.center = bounds.getCenter();
            return new google.maps.Map(document.getElementById(this.options.mapContainerId), {
                zoom: this.options.zoom,
                center: this.center,
                mapTypeId: google.maps.MapTypeId.ROADMAP
            });
        },

        _createRectangleInfo: function (rows) {
            const ret = {};
            _(rows).each(function (row) {
                ret[row[0]] = new RectangleInfo({
                    bounds: new google.maps.LatLngBounds(
                        new google.maps.LatLng(row[2], row[1]),
                        new google.maps.LatLng(row[6], row[5])),
                    subCell: row[0]
                });
            });
            return ret;
        },

        processStatusData: function (rows) {
            _(rows).each(function (row, idx) {
                const rectangleInfo = this.rectangleInfos[row[0]];
                if (rectangleInfo) {
                    rectangleInfo.setValue('reviewed', row[6]);
                    rectangleInfo.setValue('status', row[7]);
                    rectangleInfo.setValue('priority', row[8]);
                    rectangleInfo.setValue('listUrl', {
                        1: this._fixPartialBirdListURL(row[2]),
                        2: this._fixPartialBirdListURL(row[3]),
                        3: this._fixPartialBirdListURL(row[4]),
                        4: this._fixPartialBirdListURL(row[5])
                    });
                }
            }, this);
            this._drawCoverageInfo();
        },

        processPlanningData: function (rows) {
            rows = _(rows).filter(function (row) {
                return row;
            });
            _(rows).each(function (row) {
                const rectangleInfo = this.rectangleInfos[row[0]];
                if (rectangleInfo) {
                    rectangleInfo.setValue('clusterName', row[1]);
                    rectangleInfo.setValue('owner', row[5]);
                    rectangleInfo.setValue('site', row[2]);
                }
            }, this);
        },

        _fixPartialBirdListURL: function (url) {
            if (!url) {
                return '';
            }
            url = url.trim();
            if (_.isEmpty(url)) {
                return '';
            }
            return /^http/.test(url) ? url : 'http://ebird.org/ebird/view/checklist?subID=' + url
        },

        _drawCoverageInfo: function () {
            _(this.rectangleInfos).each(function (rectangleInfo) {
                const rectangle = new google.maps.Rectangle({
                        strokeColor: '#505050',
                        strokeOpacity: 0.8,
                        strokeWeight: rectangleInfo.getStrokeWeight(),
                        fillColor: rectangleInfo.getFillColor(),
                        fillOpacity: rectangleInfo.getFillOpacity(),
                        map: this.map,
                        bounds: rectangleInfo.getValue('bounds')
                    }),

                    label = new InfoBox({
                        content: rectangleInfo.getValue('subCell'),
                        boxStyle: {
                            textAlign: "center",
                            fontSize: "7pt",
                            width: "60px"
                        },
                        disableAutoPan: true,
                        pixelOffset: new google.maps.Size(-30, -5),
                        position: rectangleInfo.getValue('bounds').getCenter(),
                        closeBoxURL: "",
                        isHidden: false,
                        enableEventPropagation: true
                    });

                //keep reference handy so that the visibility can be set based on zoom level.
                this.labels.push(label);
                google.maps.event.addListener(rectangle, 'click', _.bind(this._showInfoWindow, this, rectangleInfo));
            }, this);
            this._showHideLabels();
            google.maps.event.addListener(this.map, "zoom_changed", _.bind(this._showHideLabels, this));
            this._createCustomControls();
        },

        _showInfoWindow: function (rectangleInfo) {
            const content = infoBoxTemplate(rectangleInfo.options);
            this.infoBox.setContent(content);
            this.infoBox.setPosition(rectangleInfo.getValue('bounds').getCenter());
            this.infoBox.open(this.map);
        },

        _showHideLabels: function () {
            const showLabel = this.map.getZoom() > 12;
            _(this.labels).each(function (label) {
                label.setMap(showLabel ? this.map : null);
            }, this);
        },

        gotoCurrentLocation: function () {
            this.customMapControls.find(".locationChkBox").prop("checked", true);
            this.geoLocation.setMap(this.map);
            this.geoLocation.panMapToCurrentPosition();
        },

        showLocation: function (e) {
            if (e.target.checked) {
                this.geoLocation.setMap(this.map);
                this.geoLocation.panMapToCurrentPosition();
            } else {
                this.geoLocation.setMap(null);
            }
        },

        _recenterToDistrict: function () {
            this.map.panTo(this.center);
        },

        clusterCheckboxClicked: function (e) {
            this.showCluster = e.target.checked;
            if (this.showCluster) {
                if (!this.clusterPolygons) {
                    this.clusterPolygons = this.createClusterBoundaries();
                } else {
                    _.each(this.clusterPolygons, function (clusterPolygon) {
                        clusterPolygon.polygon.setMap(this.map);
                    }, this);
                }
            } else {
                _.each(this.clusterPolygons, function (clusterPolygon) {
                    clusterPolygon.polygon.setMap(null);
                });
            }
        },

        _createCustomControls: function () {
            this.customMapControls = $(customMapControlTemplate({
                locationAvailable: this.geoLocation.isLocationAvailable()
            }));
            this.customMapControls.find(".exportKmlBtn").bind("click", _.bind(this._exportKml, this));
            this.customMapControls.find(".districtCenter").bind("click", _.bind(this._recenterToDistrict, this));
            this.customMapControls.find(".clusterChkBox").bind("click", _.bind(this.clusterCheckboxClicked, this));
            this.customMapControls.find(".locationChkBox").bind("click", _.bind(this.showLocation, this));
            this.customMapControls.find(".gotoCurrentLocation").bind("click", _.bind(this.gotoCurrentLocation, this));
            this.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(this.customMapControls[0]);
        },

        _addTextNode: function (parentNode, elem, value, ns) {
            const ownerDocument = parentNode.ownerDocument,
                node = ownerDocument.createElementNS(ns, elem),
                txtNode = ownerDocument.createTextNode("");
            txtNode.nodeValue = value;
            node.appendChild(txtNode);
            parentNode.appendChild(node);
        },

        _addKmlStyles: function (documentNode, id, color) {
            const ownerDocument = documentNode.ownerDocument,
                styleNode = ownerDocument.createElementNS(NS_KML, "Style"),
                lineStyleNode = ownerDocument.createElementNS(NS_KML, "LineStyle"),
                polyStyleNode = ownerDocument.createElementNS(NS_KML, "PolyStyle");
            this._addTextNode(lineStyleNode, 'color', '641400FF', NS_KML);
            this._addTextNode(lineStyleNode, 'width', '1', NS_KML);
            styleNode.appendChild(lineStyleNode);
            this._addTextNode(polyStyleNode, 'color', color, NS_KML);
            styleNode.appendChild(polyStyleNode);
            styleNode.setAttribute("id", id);
            documentNode.appendChild(styleNode);
        },

        polygonPathsFromBounds: function (bounds) {
            const path = new google.maps.MVCArray(),
                ne = bounds.getNorthEast(),
                sw = bounds.getSouthWest();
            let pathString = '';
            path.push(ne);
            path.push(new google.maps.LatLng(sw.lat(), ne.lng()));
            path.push(sw);
            path.push(new google.maps.LatLng(ne.lat(), sw.lng()));
            path.push(ne);
            path.forEach(function (latLng, idx) {
                pathString += [latLng.lng(), latLng.lat(), 0].join(",");
                pathString += ' ';
            });
            return pathString;
        },

        addPlacemark: function (documentNode, options) {
            const ownerDocument = documentNode.ownerDocument,
                placemarkNode = ownerDocument.createElementNS(NS_KML, 'Placemark'),
                descriptionNode = ownerDocument.createElementNS(NS_KML, 'description'),
                polygonNode = ownerDocument.createElementNS(NS_KML, 'Polygon'),
                outerBoundaryNode = ownerDocument.createElementNS(NS_KML, 'outerBoundaryIs'),
                linearRingNode = ownerDocument.createElementNS(NS_KML, 'LinearRing'),
                descriptionCdata = ownerDocument.createCDATASection(options.description);
            this._addTextNode(placemarkNode, 'name', options.name, NS_KML);
            descriptionNode.appendChild(descriptionCdata);
            placemarkNode.appendChild(descriptionNode);

            this._addTextNode(placemarkNode, 'styleUrl', '#' + options.style, NS_KML);
            this._addTextNode(linearRingNode, 'coordinates', options.pathString, NS_KML);
            this._addTextNode(polygonNode, "gx:drawOrder", options.drawOrder, NS_GX);
            outerBoundaryNode.appendChild(linearRingNode);
            polygonNode.appendChild(outerBoundaryNode);
            placemarkNode.appendChild(polygonNode);
            documentNode.appendChild(placemarkNode);
        },

        createKml: function () {
            const xmlString = '<kml xmlns="http://www.opengis.net/kml/2.2" ' +
                    'xmlns:gx="http://www.google.com/kml/ext/2.2"><Document/></kml>',
                parser = new DOMParser(),
                xmlDoc = parser.parseFromString(xmlString, "text/xml"),
                serializer = new XMLSerializer(),
                documentNode = xmlDoc.getElementsByTagName("Document")[0];

            this._addTextNode(documentNode, 'name', this.options.name, NS_KML);
            this._addKmlStyles(documentNode, 'reviewed', '99ff33ba');
            this._addKmlStyles(documentNode, 'status-1', '99b0b0b0');
            this._addKmlStyles(documentNode, 'status-2', '99808080');
            this._addKmlStyles(documentNode, 'status-3', '99505050');
            this._addKmlStyles(documentNode, 'status-4', '99202020');
            this._addKmlStyles(documentNode, 'status-0', '99ff8040');
            this._addKmlStyles(documentNode, 'cluster', '66ff9900');

            _(this.rectangleInfos).each(function (rectangleInfo) {
                const options = {
                    pathString: this.polygonPathsFromBounds(rectangleInfo.options.bounds),
                    description: kmlDescription(rectangleInfo.options),
                    name: rectangleInfo.options.subCell + (rectangleInfo.options.clusterName ? ' ' + rectangleInfo.options.clusterName : ''),
                    style: rectangleInfo.isReviewed() ? 'reviewed' : ('status-' + rectangleInfo.getValue('status')),
                    drawOrder: 2
                };
                this.addPlacemark(documentNode, options);
            }, this);

            if (this.showCluster) {
                _(this.clusterPolygons).each(function (clusterPolygon) {
                    let pathString = '';
                    clusterPolygon.polygon.getPath().forEach(function (latLng, idx) {
                        pathString += [latLng.lng(), latLng.lat(), 0].join(",");
                        pathString += ' ';
                    });
                    const options = {
                        pathString: pathString,
                        description: '',
                        name: clusterPolygon.clusterName,
                        style: 'cluster',
                        drawOrder: 1
                    };
                    this.addPlacemark(documentNode, options);
                }, this);
            }

            return serializer.serializeToString(xmlDoc);
        },

        _exportKml: function (e) {
            e.preventDefault();
            const kmlString = this.createKml(),
                bb = new Blob([kmlString], {type: 'text/plain'}),
                url = window.URL.createObjectURL(bb),
                a = document.createElement('a');

            a.setAttribute('href', url);
            a.setAttribute('download', this.options.name + '.kml');
            a.setAttribute('style', 'display: none;');
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
        },

        _parseRows: function (entries) {
            const [header, ...rows] = entries;
            return rows;
        },

        convexHull: function (points) {
            points.sort(function (a, b) {
                return a.lat() != b.lat() ? a.lat() - b.lat() : a.lng() - b.lng();
            });

            const n = points.length;
            const hull = [];

            for (let i = 0; i < 2 * n; i++) {
                const j = i < n ? i : 2 * n - 1 - i;
                while (hull.length >= 2 && this.removeMiddle(hull[hull.length - 2], hull[hull.length - 1], points[j]))
                    hull.pop();
                hull.push(points[j]);
            }

            hull.pop();
            return hull;
        },

        removeMiddle: function (a, b, c) {
            const cross = (a.lat() - b.lat()) * (c.lng() - b.lng()) - (a.lng() - b.lng()) * (c.lat() - b.lat());
            const dot = (a.lat() - b.lat()) * (c.lat() - b.lat()) + (a.lng() - b.lng()) * (c.lng() - b.lng());
            return cross < 0 || cross == 0 && dot <= 0;
        },

        getMapDataUrl: function (page) {
            return "https://sheets.googleapis.com/v4/spreadsheets/" + this.options.mapSpreadSheetId + "/values/" + page + "?key=" + API_KEY;
        }
    };

    return {
        BirdMap: BirdMap,
        createMap: function (options) {
            options = _.extend({}, options);
            const map = new BirdCount.BirdMap({
                zoom: 10,
                mapContainerId: options.mapContainerId,
                mapSpreadSheetId: options.mapSpreadSheetId,
                name: options.name,
                alert: function (message) {
                    $('.page-alert-box .modal-body').html('<p>' + message + '</p>')
                    $('.page-alert-box').modal('show');
                }
            });
            map.render();
            return map;
        }
    };
})();
