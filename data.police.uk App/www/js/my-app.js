// Code for platform detection
var isMaterial = Framework7.prototype.device.ios === false;
var isIos = Framework7.prototype.device.ios === true;
var offline = true;

// Add the above as global variables for templates
Template7.global = {
  material: isMaterial,
  ios: isIos,
};

// A template helper to turn ms durations to mm:ss
// We need to be able to pad to 2 digits
function pad2(number) {
  if (number <= 99) { number = ('0' + number).slice(-2); }
  return number;
}

// Now the actual helper to turn ms to [hh:]mm:ss
function durationFromMsHelper(ms) {
  if (typeof ms != 'number') {
    return '';
  }
  var x = ms / 1000;
  var seconds = pad2(Math.floor(x % 60));
  x /= 60;
  var minutes = pad2(Math.floor(x % 60));
  x /= 60;
  var hours = Math.floor(x % 24);
  hours = hours ? pad2(hours) + ':' : '';
  return hours + minutes + ':' + seconds;
}

// A stringify helper
// Need to replace any double quotes in the data with the HTML char
//  as it is being placed in the HTML attribute data-context
function stringifyHelper(context) {
  var str = JSON.stringify(context);
  return str.replace(/"/g, '&quot;');
}

// Finally, register the helpers with Template7
Template7.registerHelper('durationFromMs', durationFromMsHelper);
Template7.registerHelper('stringify', stringifyHelper);

// If we need to use custom DOM library, let's save it to $$ variable:
var $$ = Dom7;

if (!isIos) {
  // Change class
  $$('.view.navbar-through').removeClass('navbar-through').addClass('navbar-fixed');
  // And move Navbar into Page
  $$('.view .navbar').prependTo('.view .page');
}

// Initialize app
var myApp = new Framework7({
  material: isIos? false : true,
  template7Pages: true,
  precompileTemplates: true,
  swipePanel: 'left',
  swipePanelActiveArea: '30',
  swipeBackPage: true,
  animateNavBackIcon: true,
  pushState: !!Framework7.prototype.device.os,
});

// Add view
var mainView = myApp.addView('.view-main', {
  // Because we want to use dynamic navbar, we need to enable it for this view:
  dynamicNavbar: true,
  domCache: true,
});

// Handle Cordova Device Ready Event
$$(document).on('deviceready', function deviceIsReady() {
  console.log('Device is ready!');
  if (navigator.connection && navigator.connection.type == Connection.NONE) {
      $$('.fa-wifi').addClass('color-gray');
    }
    else {
      // It's connected, set a flag and icon colors
      offline = false;
      if (isIos) $$('.fa-wifi').addClass('color-green');
      else $$('.fa-wifi').addClass('color-white');
    }

    // Add a listener to detect a change in the connection from online to offline and vice versa
    document.addEventListener("offline", onOffline, false);
    document.addEventListener("online", onOnline, false);
});

function onOffline() {
    offline = true;
    myApp.addNotification({
       title: 'Connection Status',
       message: 'A previously connected device has gone offline.'
    });
    if (isIos) $$('.fa-wifi').removeClass('color-green').addClass('color-gray');
       else $$('.fa-wifi').removeClass('color-white').addClass('color-gray');
}

function onOnline() {
    // Show a toast notification to indicate the change
    myApp.addNotification({
        title: 'Connection Status',
        message: 'A previously connected device has come back online'
    });
    // Set the wifi icon colors to reflect the change
    if (isIos) $$('.fa-wifi').removeClass('color-gray').addClass('color-green');
    else $$('.fa-wifi').removeClass('color-gray').addClass('color-white');
    offline = false;
}


$$(document).on('click', '.panel .search-link', function searchLink() {
  // Only change route if not already on the index
  //  It would be nice to have a better way of knowing this...
  var indexPage = $$('.page[data-page=index]');
  if (indexPage.hasClass('cached')) {
    mainView.router.load({
      pageName: 'index',
      animatePages: false,
      reload: true,
    });
  }
});

$$(document).on('click', '.panel .favorites-link', function searchLink() {
  // @TODO fetch the favorites (if any) from localStorage
  var favorites = JSON.parse(localStorage.getItem('favorites'));
  mainView.router.load({
    template: myApp.templates.favorites,
    animatePages: false,
    context: {
      tracks: favorites,
    },
    reload: true,
  });
});

/**
 * Search
 *  - functionality for the main search page
 */

function searchSubmit(e) {

  var formData = myApp.formToJSON('#search');
  
  // set lat, lng
  var lat, lng;

  e.preventDefault();
  if (!formData.address) {
    myApp.alert('Please enter a search term', 'Search Error');
    return;
  }

  delete formData.filter;
  formData.type = 'track';
  $$('input').blur();
  myApp.showPreloader('Searching');
  $$.ajax({
    dataType: 'json',
    data: formData,
    processData: true,
    url: 'https://maps.googleapis.com/maps/api/geocode/json',
    success: function searchSuccess(resp) {

        // pass value into lat, lng
        lat = resp.results[0].geometry.location.lat;
        lng = resp.results[0].geometry.location.lng;
        console.log(lat + ", " + lng);

        $$.ajax({
            dataType: 'json',
            data: { q: lat + "," + lng },
            processData: true,
            url: 'https://data.police.uk/api/locate-neighbourhood',
            success: function searchSuccess(force) {

                console.log(force.force);

                $$.ajax({
                    dataType: 'json',
                    processData: true,
                    url: 'https://data.police.uk/api/' + force.force + '/neighbourhoods',
                    success: function searchSuccess(nbrhds) {
                        myApp.hidePreloader();
                        mainView.router.load({
                            template: myApp.templates.results,
                            context: {
                                force: force.force,
                                forces: nbrhds,
                            },
                        });
                    }
                });

            }
        });

    }//,
    //error: function searchError(xhr, err) {
    //  myApp.hidePreloader();
    //  myApp.alert('An error has occurred', 'Search Error');
    //  console.error("Error on ajax call: " + err);
    //  console.log(JSON.stringify(xhr));
    //}
  });
}

$$(document).on('submit', '#search', searchSubmit);

/**
 * Details page
 *  - controls the playback controls and preview media object
 */

var mediaPreview = null;
var mediaTimer = null;

function playbackControlsClickHandler(e) {
  var buttonTarget = $$(e.target);
  if (buttonTarget.hasClass('play')) {
    monitorMediaPreviewCurrentPosition(mediaPreview);
    mediaPreview.play();
    setPlaybackControlsStatus('pending');
    return;
  }
  monitorMediaPreviewCurrentPosition();
  mediaPreview.stop();
  setPlaybackControlsStatus('stopped');
  return;
};

function setPlaybackControlsStatus(status) {
  var allButtons = $$('.playback-controls a');
  var playButton = $$('.playback-controls .play-button');
  var pendingButton = $$('.playback-controls .pending-button');
  var stopButton = $$('.playback-controls .stop-button');
  switch (status) {
    case 'stopped':
      allButtons.removeClass('displayed');
      playButton.addClass('displayed');
      break;
    case 'pending':
      allButtons.removeClass('displayed');
      pendingButton.addClass('displayed');
      break;
    case 'playing':
      allButtons.removeClass('displayed');
      stopButton.addClass('displayed');
      break;
    default:
      allButtons.removeClass('displayed');
      playButton.addClass('displayed');
  }
}

function monitorMediaPreviewCurrentPosition(media) {
  var percent = 0;
  var progressbar = $$('.playback-controls .duration .progressbar');
  // If no media object is provided, stop monitoring
  if (!media) {
    clearInterval(mediaTimer);
    return;
  }
  mediaTimer = setInterval(function () {
    media.getCurrentPosition(
      function (position) {
        if (position > -1) {
          percent = (position / media.getDuration()) * 100;
          myApp.setProgressbar(progressbar, percent);
        }
      },
      function (e) {
        console.error("Error getting position", e);
      });
  }, 100);
}

function mediaPreviewSuccessCallback() {
  var progressbar = $$('.playback-controls .duration .progressbar');
  setPlaybackControlsStatus('stopped');
  myApp.setProgressbar(progressbar, 0, 100);
}

function mediaPreviewErrorCallback(error) {
  setPlaybackControlsStatus('stopped');
  console.error(error);
}

function mediaPreviewStatusCallback(status) {
  var progressbar = $$('.playback-controls .duration .progressbar');
  switch (status) {
    case 2: // playing
      setPlaybackControlsStatus('playing');
      myApp.setProgressbar(progressbar, 0, 0);
      break;
    case 4: // stopped
      setPlaybackControlsStatus('stopped');
      break;
    default:
      // Default fall back not needed
  }
}

function addOrRemoveFavorite(e) {
  if (this.isFavorite) {
    // remove the favorite from the arrays
    this.favoriteIds.splice(this.favoriteIds.indexOf(this.id), 1);
    var favorites = this.favorites.filter(function(fave) {
      return fave.id !== this.id;
    }, this);
    this.favorites = favorites;
    this.isFavorite = false;
    // update the UI
    $$('.link.star').html('<i class="fa fa-star-o"></i>');
  } else {
    // add the favorite to the arrays
    if (this.favorites === null) this.favorites = [];
    this.favorites.push(this.track);
    this.favoriteIds.push(this.id);
    this.isFavorite = true;
    // update the UI
    $$('.link.star').html('<i class="fa fa-star"></i>');
  }
  if (this.favorites.length === 0) {
    // clear it out so the template knows it's empty when it returns
    //  as {{#if favorites}} sees an empty array as truthy
    this.favorites = null;
  }
  // save it back to localStorage
  localStorage.setItem('favorites', JSON.stringify(this.favorites));
  localStorage.setItem('favoriteIds', JSON.stringify(this.favoriteIds));
  // if we got here from the favorites page, we need to reload its context
  //  so it will update as soon as we go "back"
  if (this.fromPage === 'favorites') {
    // Reload the previous page
    mainView.router.load({
      template: myApp.templates.favorites,
      context: {
        tracks: this.favorites,
      },
      reload: true,
      reloadPrevious: true,
    });
  }
}

myApp.onPageInit('results', function (page) {

    var mySearchbar = myApp.searchbar('.searchbar', {
        searchList: '.list-block-search',
        searchIn: '.item-content',
        found: '.searchbar-found',
        notFound: 'searchbar-not-found'
    });

    //$$(page.container).find('.share').on('click', function (e) {
    //    var item = page.context.tracks.items[this.dataset.item]

    //    if (window.plugins && window.plugins.socialsharing) {
    //        window.plugins.socialsharing.share("Hey! I found this on Spotify. It's called " + item.name + ", check it out!",
    //            'Check this out', item.album.images[2].url, item.preview_url,
    //            function () {
    //                console.log("Share Success")
    //            },
    //            function (error) {
    //                console.log("Share fail " + error)
    //            });
    //    }
    //    else myApp.alert("Share plugin not found");
    //});

    $$(page.container).find('.item-link.item-content').on('click', function (e, f, g) {

        myApp.showPreloader('Searching');

        var item = JSON.parse(this.dataset.context);

        $$.ajax({
            dataType: 'json',
            processData: true,
            url: 'https://data.police.uk/api/' + item.force + '/' + item.id,
            success: function searchSuccess(details) {
                myApp.hidePreloader();
                mainView.router.load({
                    template: myApp.templates.neighbourhood,
                    context: {
                        neighbourhoods: details,
                    }
                });
            }
        });

    });

})


myApp.onPageInit('neighbourhood', function (page) {
    
    console.log("loaded neighbourhood");

    // fetch the favorites
    var favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    var favoriteIds = JSON.parse(localStorage.getItem('favoriteIds')) || [];
    var isFavorite = false;
    if (favoriteIds.indexOf(page.context.id) !== -1) {
        $$('.link.star').html('<i class="fa fa-star"></i>');
        isFavorite = true;
    }

    // set up a context object to pass to the handler
    var pageContext = {
        track: page.context,
        id: page.context.id,
        isFavorite: isFavorite,
        favorites: favorites,
        favoriteIds: favoriteIds,
        fromPage: page.fromPage.name,
    };

    // bind the playback and favorite controls
    $$('.playback-controls a').on('click', playbackControlsClickHandler);
    $$('.link.star').on('click', addOrRemoveFavorite.bind(pageContext));

});


myApp.onPageInit('details', function(page) {
  var previewUrl = page.context.preview_url;
  if (typeof Media !== 'undefined') {
    // Create media object on page load so as to let it start buffering right
    //  away...
    mediaPreview = new Media(previewUrl, mediaPreviewSuccessCallback,
      mediaPreviewErrorCallback, mediaPreviewStatusCallback);
  } else {
    // Create a dummy media object for when viewing in a browser, etc
    //  this really is optional, using `phonegap serve` polyfills the
    //  Media plugin
    function noMedia() {
      myApp.alert('Media playback not supported', 'Media Error');
      setTimeout(function() {
        setPlaybackControlsStatus('stopped');
        mediaPreviewStatusCallback(4); // stopped
        console.error('No media plugin available');
      }, 0);
    }
    mediaPreview = {
      play: noMedia,
      stop: function() {},
      release: function() {},
      getCurrentPosition: function() {},
    };
  }

  // fetch the favorites
  var favorites = JSON.parse(localStorage.getItem('favorites')) || [];
  var favoriteIds = JSON.parse(localStorage.getItem('favoriteIds')) || [];
  var isFavorite = false;
  if (favoriteIds.indexOf(page.context.id) !== -1) {
    $$('.link.star').html('<i class="fa fa-star"></i>');
    isFavorite = true;
  }
  // set up a context object to pass to the handler
  var pageContext = {
    track: page.context,
    id: page.context.id,
    isFavorite: isFavorite,
    favorites: favorites,
    favoriteIds: favoriteIds,
    fromPage: page.fromPage.name,
  };

  // bind the playback and favorite controls
  $$('.playback-controls a').on('click', playbackControlsClickHandler);
  $$('.link.star').on('click', addOrRemoveFavorite.bind(pageContext));
});

myApp.onPageBeforeRemove('details', function(page) {
  // stop playing before leaving the page
  monitorMediaPreviewCurrentPosition();
  mediaPreview.stop();
  mediaPreview.release();
  // keep from leaking memory by removing the listeners we don't need
  $$('.playback-controls a').off('click', playbackControlsClickHandler);
  $$('.link.star').off('click', addOrRemoveFavorite);
});
