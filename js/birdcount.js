/**
 * Author vj
 * http://www.vijaykonnackal.com
 *
 * Licensed under MIT license.
 */
var BirdCount = BirdCount || (function() {
    var $ = jQuery, //wp noConflicts $. Capture $ in this scope
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

        RectangleInfo = function(options) {
            this.options = _.extend({
                    subCell: null,
                    bounds: null,
                    clusterName: null,
					site: null,
                    owner: null,
                    listUrl: {},
                    reviewed: 'no',
                    status: 0
                }, options);
        },

        BirdMap = function(options) {
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
        setValue: function(name, value) {
            this.options[name] = value;
        },

        getValue: function(name) {
            return this.options[name];
        },

        isReviewed: function() {
            return this.getValue('reviewed') 
                ? _.indexOf(REVIEWED_PATTERN, this.getValue('reviewed').toLowerCase()) >= 0 
                : false;
        },

        getFillColor: function() {
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

        getFillOpacity: function() {
			return '0.60';
        }
    };

    BirdMap.prototype = {
        options: null,
        map: null,
        center: null,
        rectangleInfos: {},
        labels: [],
        infoBox: new google.maps.InfoWindow(),

        render: function() {
            var sheetData = {},
                drawMapAfter = _.after(3, _.bind(this.drawMap, this, sheetData));

            $.ajax({
                    url: this.getMapDataUrl(this.options.sheets[0]),
                    jsonp: "callback",
                    dataType: "jsonp",
                    context: this,
                    success: function(response) {
                        if (!/^Coordinates/.test(response.feed.title.$t)) {
                            if(this.options.alert) {
                                this.options.alert();
                            }
                        }
                        sheetData['coordinates'] = this._parseRows(response.feed.entry);
                        drawMapAfter();
                    }
                });

            $.ajax({
                url: this.getMapDataUrl(this.options.sheets[2]),
                jsonp: "callback",
                dataType: "jsonp",
                context: this,
                success: function(response) {
                    if (!/^Birds/.test(response.feed.title.$t)) {
                        if(this.options.alert) {
                            this.options.alert();
                        }
                    }
                    sheetData['status'] = this._parseRows(response.feed.entry);
                    drawMapAfter();
                }
            });

            $.ajax({
                url: this.getMapDataUrl(this.options.sheets[1]),
                jsonp: "callback",
                dataType: "jsonp",
                context: this,
                success: function(response) {
                    if (!/^Planning/.test(response.feed.title.$t)) {
                        if(this.options.alert) {
                            this.options.alert();
                        }
                    }
                    sheetData['planning'] = this._parseRows(response.feed.entry);
                    drawMapAfter();
                }
            });
        },

        drawMap: function(sheetData) {
            this.processCoordinates(sheetData['coordinates']);
            this.processStatusData(sheetData['status']);
            this.processPlanningData(sheetData['planning']);
        },

        recenter: function() {
            if (this.map) {
                google.maps.event.trigger(this.map, 'resize');
                this.map.setCenter(this.center);
            }
        },

        processCoordinates: function(rows) {
            this.map = this._createMap(rows);
            this.rectangleInfos = this._createRectangleInfo(rows);
        },

        _createMap: function(rows) {
            var bounds = new google.maps.LatLngBounds();
            _(rows).each(function(row) {
                bounds.extend(new google.maps.LatLng(row.C, row.B));
                bounds.extend(new google.maps.LatLng(row.G, row.F));
            });
            this.center = bounds.getCenter();
            return new google.maps.Map(document.getElementById(this.options.mapContainerId), {
                    zoom: this.options.zoom,
                    center: this.center,
                    mapTypeId: google.maps.MapTypeId.ROADMAP
                });
        },

        _createRectangleInfo: function(rows) {
            var ret = {};
            _(rows).each(function(row) {
                ret[row.A] = new RectangleInfo({
                    bounds: new google.maps.LatLngBounds(
                        new google.maps.LatLng(row.C, row.B),
                        new google.maps.LatLng(row.G, row.F)),
                    subCell: row.A
                });
            });
            return ret;
        },

        processStatusData: function(rows) {
            _(rows).each(function(row, idx) {
                var rectangleInfo = this.rectangleInfos[row.A];
                if (rectangleInfo) {
                    rectangleInfo.setValue('reviewed', row.G);
                    rectangleInfo.setValue('status', row.H);
                    rectangleInfo.setValue('listUrl', {
                            1: this._fixPartialBirdListURL(row.C),
                            2: this._fixPartialBirdListURL(row.D),
                            3: this._fixPartialBirdListURL(row.E),
                            4: this._fixPartialBirdListURL(row.F)
                        });
                }
            }, this);
            this._drawCoverageInfo();
        },

        processPlanningData: function(rows) {
            rows = _(rows).filter(function(row) {
                return row;
            });
            _(rows).each(function(row) {
                var rectangleInfo = this.rectangleInfos[row.A];
                if (rectangleInfo) {
                    rectangleInfo.setValue('clusterName', row.B);
					rectangleInfo.setValue('site', row.C);
                    rectangleInfo.setValue('owner', row.F);
                }
            }, this);
        },

        _fixPartialBirdListURL: function(url) {
            if (!url) {
                return '';
            }
            url = url.trim();
            if (_.isEmpty(url)) {
                return '';
            }
            return /^http/.test(url) ? url : 'http://ebird.org/ebird/view/checklist?subID=' + url
        },

        _drawCoverageInfo: function() {
            _(this.rectangleInfos).each(function(rectangleInfo) {
                var rectangle = new google.maps.Rectangle({
                        strokeColor: '#505050',
                        strokeOpacity: 0.8,
                        strokeWeight: 1,
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
            this._createExportButton();
        },

        _showInfoWindow: function(rectangleInfo) {
            var content = infoBoxTemplate(rectangleInfo.options);
            this.infoBox.setContent(content);
            this.infoBox.setPosition(rectangleInfo.getValue('bounds').getCenter());
            this.infoBox.open(this.map);
        },

        _showHideLabels: function() {
            var showLabel = this.map.getZoom() > 12;
            _(this.labels).each(function(label) {
                label.setMap(showLabel ? this.map : null);
            }, this);
        },

        _createExportButton: function() {
            var exportControlDiv = document.createElement('div'),
                controlUIContainer = document.createElement('div'),
                controlUI = document.createElement('div');
            exportControlDiv.className = "gmnoprint custom-control-container";
            controlUIContainer.className = "gm-style-mtc";
            exportControlDiv.appendChild(controlUIContainer);
            controlUI.className = "custom-control";
            controlUI.title = 'Export the KML for the Visualization';
            controlUI.innerHTML = 'Export';
            controlUIContainer.appendChild(controlUI);
            exportControlDiv.index = 1;
            google.maps.event.addDomListener(controlUI, 'click', _.bind(this._exportKml, this));
            this.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(exportControlDiv);
        },

        _addTextNode: function (parentNode, elem, value) {
            var ownerDocument = parentNode.ownerDocument,
                node = ownerDocument.createElement(elem),
                txtNode =  ownerDocument.createTextNode("");
            txtNode.nodeValue = value;
            node.appendChild(txtNode);
            parentNode.appendChild(node);
        },

        _addKmlStyles: function (documentNode, id, color) {
            var ownerDocument = documentNode.ownerDocument,
                styleNode = ownerDocument.createElement("Style"),
                lineStyleNode = ownerDocument.createElement("LineStyle"),
                polyStyleNode = ownerDocument.createElement("PolyStyle");
            this._addTextNode(lineStyleNode, 'color', '641400FF');
            this._addTextNode(lineStyleNode, 'width', '1');
            styleNode.appendChild(lineStyleNode);
            this._addTextNode(polyStyleNode, 'color', color);
            styleNode.appendChild(polyStyleNode);
            styleNode.setAttribute("id", id);
            documentNode.appendChild(styleNode);
        },

        polygonPathsFromBounds: function(bounds){
            var path = new google.maps.MVCArray(),
                ne = bounds.getNorthEast(),
                sw = bounds.getSouthWest(),
                pathString = '';
            path.push(ne);
            path.push(new google.maps.LatLng(sw.lat(), ne.lng()));
            path.push(sw);
            path.push(new google.maps.LatLng(ne.lat(), sw.lng()));
            path.push(ne);
            path.forEach(function(latLng, idx){
                pathString += [latLng.lng(), latLng.lat(), 0].join(",");
                pathString += ' ';
            });
            return pathString;
        },

        addPlacemark: function (documentNode, rectangleInfo) {
            var ownerDocument = documentNode.ownerDocument,
                placemarkNode = ownerDocument.createElement('Placemark'),
                descriptionNode = ownerDocument.createElement('description'),
                polygonNode = ownerDocument.createElement('Polygon'),
                outerBoundaryNode = ownerDocument.createElement('outerBoundaryIs'),
                linearRingNode = ownerDocument.createElement('LinearRing'),
                pathString = this.polygonPathsFromBounds(rectangleInfo.options.bounds),
                style = 'status-0',
                description = kmlDescription(rectangleInfo.options),
                descriptionCdata = ownerDocument.createCDATASection(description);
            this._addTextNode(placemarkNode, 'name', rectangleInfo.options.subCell + ' ' + rectangleInfo.options.clusterName);
            descriptionNode.appendChild(descriptionCdata);
            placemarkNode.appendChild(descriptionNode);
            if (rectangleInfo.isReviewed()) {
                style = 'reviewed';
            } else {
                style = 'status-' + rectangleInfo.getValue('status');
            }

            this._addTextNode(placemarkNode, 'styleUrl', '#' + style);
            this._addTextNode(linearRingNode, 'coordinates', pathString);
            outerBoundaryNode.appendChild(linearRingNode);
            polygonNode.appendChild(outerBoundaryNode);
            placemarkNode.appendChild(polygonNode);
            documentNode.appendChild(placemarkNode);
        },

        createKml: function() {
            var xmlString = '<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>',
                parser = new DOMParser(),
                xmlDoc = parser.parseFromString(xmlString, "text/xml"),
                serializer = new XMLSerializer(),
                documentNode = xmlDoc.getElementsByTagName("Document")[0];

            this._addTextNode(documentNode, 'name', this.options.name);
            this._addKmlStyles(documentNode, 'reviewed', '99ff33ba');
            this._addKmlStyles(documentNode, 'status-1', '99b0b0b0');
            this._addKmlStyles(documentNode, 'status-2', '99808080');
            this._addKmlStyles(documentNode, 'status-3', '99505050');
            this._addKmlStyles(documentNode, 'status-4', '99202020');
            this._addKmlStyles(documentNode, 'status-0', '99ff8040');

            _(this.rectangleInfos).each(function(rectangleInfo){
                this.addPlacemark(documentNode, rectangleInfo);
            }, this);

            return serializer.serializeToString(xmlDoc);
        },

        _exportKml: function(e) {
            e.preventDefault();
            var kmlString = this.createKml(),
                bb = new Blob([kmlString], {type: 'text/plain'}),
                url = window.URL.createObjectURL(bb),
                a = document.createElement('a');

            a.setAttribute('href', url);
            a.setAttribute('download', this.options.name + '.kml');
            a.setAttribute('style', 'display: none;');
            document.body.appendChild(a);
            a.click();
            setTimeout(function(){
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
        },

        _parseRows: function(entries) {
            var rows = [];
            _(entries).each(function(entry) {
                var cell = entry.title.$t,
                    cellSplit = CELL_PATTERN.exec(cell),
                    col = cellSplit[1],
                    row = parseInt(cellSplit[2], 10),
                    rowIdx = row - 2, //spreadsheet rows are 1 based. Also account for header row.
                    rowObj = rows[rowIdx] || {};

                if (row > 1) { //skip header row
                    rowObj[col] = entry.content.$t;
                    rows[rowIdx] = rowObj;
                }
            });
            return rows;
        },

        getMapDataUrl: function(page) {
            return "https://spreadsheets.google.com/feeds/cells/" + this.options.mapSpreadSheetId + "/" + page + "/public/basic?alt=json-in-script";
        }
    };

    return {
        BirdMap: BirdMap,
        createMap: function(options) {
            var map = new BirdCount.BirdMap({
                zoom: 10,
                mapContainerId: options.mapContainerId,
                mapSpreadSheetId: options.mapSpreadSheetId,
                sheets: options.sheets.split(','),
                name: options.name,
                alert: function() {
                    $('.page-alert-box').modal('show');
                }
            });
            map.render();
            return map;
        }
    };
})();
