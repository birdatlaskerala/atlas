(function () {

    var App = {
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
            var self = this;
            $('ul.nav a').click(function (e) {
                e.preventDefault();
                $(this).tab('show');
            });

            $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
                var target = $(e.target).attr("href"),
                    key = target.substring(1),
                    map = self.getOrCreateMap(key);
                map.recenter();
            });

            var navbar = $("#navbar");
            navbar.on("click", "a", null, function (e) {
                e.preventDefault();
                navbar.collapse('hide');
            });
        }
    };

    $(window).load(function () {
        App.init();
        //show first tab map.
        App.getOrCreateMap('thiruvananthapuram');
    });
})();