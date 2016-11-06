var PirateBay = require('thepiratebay');
var Client = require("node-tvdb");
var fs = require("fs");
var path = require("path");
var moment = require("moment");
var Q = require("q");
var Transmission = require('transmission');
var config = JSON.parse(fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf8'));
var series = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/series.json'), 'utf8'));
var transmission = new Transmission(config.transmission);
module.exports = {
    searchForEpisodesToDownload: searchForEpisodesToDownload,
    searchEpisodeTorrents: searchEpisodeTorrents,
    downloadEpisodeTorrents: downloadEpisodeTorrents,
    findEpisodeSubtitles: findEpisodeSubtitles
};

function searchForEpisodesToDownload() {
    let defer = Q.defer();
    let tvdb = new Client(config.tvDbAPIKey);

    var promises = [];

    if (!series) {
        series = [];
    }

    series.forEach(serie => {
        // On cherche les épisodes diffusés la veille
        promises.push(tvdb.getEpisodeByAirDate(serie.id, moment().add(-1, "days").format("YYYY-MM-DD")));
    });
    Q.allSettled(promises).then(results => {
        let episodesToDL = [];
        results.forEach(function (result) {
            if (result.state === "fulfilled") {
                if (result.value) {
                    console.log(`TV Db response : ${JSON.stringify(result.value)}`);
                    if (Array.isArray(result.value)) {
                        result.value.forEach(tvDbEpisode => {
                            episodesToDL.push(logAndConvertEpisodeForDL(tvDbEpisode));
                        });
                    } else {
                        episodesToDL.push(logAndConvertEpisodeForDL(result.value));
                    }
                }
            } else {
                console.log(`Erreur de promesse ${result.reason}`);
            }
        });

        defer.resolve(episodesToDL);
    });

    return defer.promise;
}

function searchEpisodeTorrents(airedEpisodes) {
    let defer = Q.defer();
    let episodesToDL = airedEpisodes;
    var promises = [];
    episodesToDL.forEach(episode => {
        // On cherche les torrents des épisodes
        promises.push(PirateBay.search(`${episode.series} S${episode.season}E${episode.number}`, {
            category: 'all',
            filter: {
                verified: true
            },
            page: 0,
            orderBy: 'leeches',
            sortBy: 'desc'
        }));
    });
    Q.allSettled(promises).then(results => {
        results.forEach(function (result, index) {
            if (result.state === "fulfilled") {
                if (result.value && result.value.length > 0) {
                    console.log(`Torrents trouvés : ${JSON.stringify(result.value)}`);
                    episodesToDL[index].torrentName = result.value[0].name;
                    episodesToDL[index].magnetLink = result.value[0].magnetLink;
                } else {
                    console.log(`Pas de torrent trouvé`);
                }
            } else {
                console.log(`Erreur de promesse ${result.reason}`);
            }
        });

        defer.resolve(episodesToDL);
    });

    return defer.promise;
}

function downloadEpisodeTorrents(airedEpisodes) {
    let defer = Q.defer();
    let episodesToDL = airedEpisodes.filter(episode => {
        return episode.magnetLink
    });

    let requests = episodesToDL.map((episode) => {
        return new Promise((resolve) => {
            transmission.addUrl(episode.magnetLink, {
                "download-dir": "/media/MEDIAS/downloads"
            }, (error, result) => {
                if (error) {
                    console.log(`Erreur à l'ajout d'un torrent : ${error}`)
                } else {
                    console.log(`Torrent ajouté : ${result.id}`);
                    episode.transmissionId = result.id;
                    transmission.start(result.id, function (err) {
                        if (err) {
                            console.log(`Erreur au démarrage d'un torrent : ${error}`)
                        } else {
                            console.log(`Torrent démarré : ${result.id}`);
                        }
                    });
                }
                resolve();
            });
        });
    });

    Promise.all(requests).then(() => {
        defer.resolve(episodesToDL);
    });

    return defer.promise;
}

function findEpisodeSubtitles(airedEpisodes) {

}

function getSeriesName(id) {
    let matchingSeries = series.filter(serie => {
        return serie.id == id;
    });

    if (matchingSeries && matchingSeries.length > 0) {
        return matchingSeries[0].name;
    } else {
        return '';
    }
}

function logAndConvertEpisodeForDL(tvDbEpisode) {
    let episode = {
        "series": getSeriesName(tvDbEpisode.seriesid),
        "name": tvDbEpisode.EpisodeName,
        "season": tvDbEpisode.SeasonNumber.length == 1 ? `0${tvDbEpisode.SeasonNumber}` : tvDbEpisode.SeasonNumber,
        "number": tvDbEpisode.EpisodeNumber.length == 1 ? `0${tvDbEpisode.EpisodeNumber}` : tvDbEpisode.EpisodeNumber
    };
    console.log(`${episode.series}, épisode diffusé hier : ${episode.name} (S${episode.season}E${episode.number})`);

    return episode;
}