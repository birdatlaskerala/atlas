(function ($, BirdCount) {

    var app = $.sammy('#main', function () {
        var maps = {};

        function getOrCreateMap(id) {
            var map = maps[id];
            if (!map) {
                map = BirdCount.createMap(MAP_DATA[id]);
                maps[id] = map;
            }
            return map;
        }

        this.get('#/', function (context) {
            var first = $('ul.nav a:first').attr('href');
            this.redirect(first);
        });

        this.get('#/kerala/:district', function (context) {
            var district = this.params['district'],
                map = getOrCreateMap(district);
            $('ul.nav a[data-target="#' + district + '"]').tab('show');
            map.recenter();
        });
    });

    $(window).load(function () {
        app.run('#/');

        var navbar = $("#navbar");
        $('ul.nav a').click(function (e) {
            app.setLocation($(this).attr('href'));
            navbar.collapse('hide');
        });
    });
})(jQuery, BirdCount);
