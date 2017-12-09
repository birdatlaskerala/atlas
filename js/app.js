(function ($) {

    var BirdMaps = {
        maps: {},

        getOrCreateMap: function (id) {
            var map = this.maps[id];
            if (!map) {
                map = BirdCount.createMap(MAP_DATA[id]);
                this.maps[id] = map;
            }
            return map;
        },

        init: function () {
            var navbar = $("#navbar");
            $('ul.nav a').click(function (e) {
                app.setLocation($(this).attr('href'));
                navbar.collapse('hide');
            });
        }
    };

    var app = $.sammy('#main', function () {
        this.get('#/', function (context) {
            this.redirect("#/kerala/thiruvananthapuram");
        });

        this.get('#/kerala/:district', function (context) {
            var district = this.params['district'],
                map = BirdMaps.getOrCreateMap(district);
            $('ul.nav a[data-target="#' + district + '"]').tab('show');
            map.recenter();
        });
    });

    $(window).load(function () {
        BirdMaps.init();
        app.run('#/');
    });
})(jQuery);
