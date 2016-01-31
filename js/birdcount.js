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

        RectangleInfo = function(options) {
            this.options = _.extend({
                    subCell: null,
                    bounds: null,
                    clusterName: null,
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
                    sheets: [1, 2, 3]  //default page indices. overriden with values in options that come from html
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
                    return '#000000';
            }
        },

        getFillOpacity: function() {
            if (!this.isReviewed() && this.getValue('status') == '0') {
                return '0';
            } else {
                return '0.60';
            }
        },

        getDisplayHtml: function() {
            var content = '<span><b>' + this.options.clusterName + '</b>';
            if (this.options.owner && !_.isEmpty(this.options.owner)) {
                content += '<br/><b>Owner: </b>' + this.options.owner
            }
            var linkContent = '';
            _.each(this.options.listUrl, function(value, key) {
                value = value ? value.trim() : '';
                if (!_.isEmpty(value)) {
                    value = value.indexOf('http') == 0 ? value : 'http://ebird.org/ebird/view/checklist?subID=' + value;
                    linkContent += ' <a target="_blank" href="' + value + '">' + key + '</a> ';
                }
            });
            if (!_.isEmpty(linkContent)) {
                content += '<br/>' + linkContent;
            };
            return content;
        }
    };

    BirdMap.prototype = {
        options: null,
        map: null,
        rectangleInfos: {},
        labels: [],
        infoBox: new google.maps.InfoWindow(),

        render: function() {
            $.ajax({
                    url: this.getMapDataUrl(this.options.sheets[0]),
                    jsonp: "callback",
                    dataType: "jsonp",
                    context: this,
                    success: function(response) {
                        this.processCoordinates(response.feed.entry);
                    }
                });
        },

        processCoordinates: function(entries) {
            var rows = this._parseRows(entries);
            this.map = this._createMap(rows);
            this.rectangleInfos = this._createRectangleInfo(rows);
            this.getStatusData();
            this.getPlanningData();
        },

        _createMap: function(rows) {
            var bounds = new google.maps.LatLngBounds();
            _(rows).each(function(row) {
                bounds.extend(new google.maps.LatLng(row.C, row.B));
                bounds.extend(new google.maps.LatLng(row.G, row.F));
            });

            return new google.maps.Map(document.getElementById(this.options.mapContainerId), {
                    zoom: this.options.zoom,
                    center: bounds.getCenter(),
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

        getStatusData: function() {
            $.ajax({
                    url: this.getMapDataUrl(this.options.sheets[2]),
                    jsonp: "callback",
                    dataType: "jsonp",
                    context: this,
                    success: function(response) {
                        this.processStatusData(response.feed.entry);
                    }
                });
        },

        processStatusData: function(entries) {
            var rows = this._parseRows(entries);
            _(rows).each(function(row) {
                var rectangleInfo = this.rectangleInfos[row.A];
                if (rectangleInfo) {
                    rectangleInfo.setValue('clusterName', row.B);
                    rectangleInfo.setValue('reviewed', row.G);
                    rectangleInfo.setValue('status', row.H);
                    rectangleInfo.setValue('listUrl', {
                            1: row.C,
                            2: row.D,
                            3: row.E,
                            4: row.F
                        });
                }
            }, this);
            this._drawCoverageInfo();
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
        },

        _showInfoWindow: function(rectangleInfo) {
            this.infoBox.setContent(rectangleInfo.getDisplayHtml());
            this.infoBox.setPosition(rectangleInfo.getValue('bounds').getCenter());
            this.infoBox.open(this.map);
        },

        _showHideLabels: function() {
            var showLabel = this.map.getZoom() > 12;
            _(this.labels).each(function(label) {
                label.setMap(showLabel ? this.map : null);
            }, this);
        },

        getPlanningData: function() {
            $.ajax({
                    url: this.getMapDataUrl(this.options.sheets[1]),
                    jsonp: "callback",
                    dataType: "jsonp",
                    context: this,
                    success: function(response) {
                        this.processPlanningData(response.feed.entry);
                    }
                });
        },

        processPlanningData: function(entries) {
            var rows = this._parseRows(entries);
            rows = _(rows).filter(function(row) {
                return row;
            });
            _(rows).each(function(row) {
                var rectangleInfo = this.rectangleInfos[row.A];
                if (rectangleInfo) {
                    rectangleInfo.setValue('owner', row.E);
                }
            }, this);
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
        BirdMap: BirdMap
    };
})();