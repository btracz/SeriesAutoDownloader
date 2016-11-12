var PirateBay = require('thepiratebay');
var Client = require("node-tvdb");
var fs = require("fs");
var path = require("path");
var moment = require("moment");
var Q = require("q");
var request = require("request");
var Transmission = require('transmission');
var scheduler = require("./scheduler");
var config = JSON.parse(fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf8'));
var series = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/series.json'), 'utf8'));
var episodes = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/airedEpisodesToProvide.json'), 'utf8'));
var transmission = new Transmission(config.transmission);
const OpenSub = require('opensubtitles-api');
const OpenSubtitles = new OpenSub({
    useragent: 'OSTestUserAgentTemp',
    username: config.opensubUsername,
    password: require('crypto').createHash('md5').update(config.opensubPassword).digest('hex'),
    ssl: true
});


module.exports = {
    startEpisodeFinder: startEpisodeFinder,
    startTorrentWatcher: startTorrentWatcher,
    startSubFinder: startSubFinder,
    searchForEpisodesToDownload: searchForEpisodesToDownload,
    searchEpisodeTorrents: searchEpisodeTorrents,
    downloadEpisodeTorrents: downloadEpisodeTorrents,
    findEpisodeSubtitles: findEpisodeSubtitles,
    getTorrentsStatus: getTorrentsStatus,
    getTorrentStatus: getTorrentStatus,
    getEpisodes: getEpisodes,
    findAndDownloadNewEpisodes: findAndDownloadNewEpisodes
};

function getEpisodes() {
    return episodes;
}

/* ##### TACHES #### */
function startEpisodeFinder() {
    console.log("lancement de l'ordonnanceur de recherche quotidien");
    scheduler.createJob("episodeFinder", "0 16 * * *", findAndDownloadNewEpisodes);
    scheduler.startTask("episodeFinder");
}

function startTorrentWatcher() {
    console.log("lancement de la surveillance et classification des torrents");
    scheduler.createJob("torrentWatcher", "*/2 * * * *", watchTorrents);
    scheduler.startTask("torrentWatcher");
}

function startSubFinder() {
    console.log("lancement de la recherche des sous-titres");
    scheduler.createJob("subFinder", "1-59/2 * * * *", findEpisodeSubtitles);
    scheduler.startTask("subFinder");
}

function findAndDownloadNewEpisodes() {
    let defer = Q.defer();
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Recherche d'épisodes`);
    searchForEpisodesToDownload().then(airedEpisodes => {
        console.log("SearchForEpisodesToDownload terminé");
        if (airedEpisodes && airedEpisodes.length > 0) {
            console.log(`${airedEpisodes.length} épisode(s) trouvé(s)`);
            searchEpisodeTorrents(airedEpisodes).then(downloadableEpisodes => {
                console.log("searchEpisodeTorrents terminé");
                if (downloadableEpisodes && downloadableEpisodes.length > 0) {
                    console.log(`${downloadableEpisodes.length} épisode(s) téléchargeable(s)`);
                    downloadEpisodeTorrents(downloadableEpisodes).then(downloadingEpisodes => {
                        console.log("downloadEpisodeTorrents terminé");
                        if (downloadingEpisodes && downloadingEpisodes.length > 0) {
                            console.log(`${downloadingEpisodes.length} épisode(s) en cours de téléchargement`);

                            downloadingEpisodes.forEach((downloadingEpisode) => {
                                episodes.push(downloadingEpisode);
                            });

                            defer.resolve(episodes);
                            saveEpisodes();
                        } else {
                            defer.resolve("Pas de torrent en cours");
                            console.log(`Pas de torrent en cours`);
                        }
                    });
                } else {
                    defer.resolve("Pas de torrent trouvé");
                    console.log(`Pas de torrent trouvé`);
                }
            });
        } else {
            defer.resolve("Aucun épisode trouvé");
            console.log(`Aucun épisode trouvé`);
        }
    });

    return defer.promise;
}

function watchTorrents() {
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Vérification des torrents`);
    if (episodes && episodes.length > 0) {
        getTorrentsStatus().then((torrentsStatus) => {
            console.log(`Torrents status : ${JSON.stringify(torrentsStatus)}`);
            var activeTorrents = [];
            if (torrentsStatus && torrentsStatus.torrents && torrentsStatus.torrents.length > 0) {
                torrentsStatus.torrents.forEach((torrent) => {
                    console.log(`Torrent (${torrent.id}) ${torrent.name}, status : ${torrent.status}, doneDate ${torrent.doneDate}`);
                    if (torrent.doneDate > 0) {
                        var epiIndex = getEpisodeIndexFromTorrentName(torrent.name);
                        console.log(`Episode index ${epiIndex}`);
                        // Le torrent est rattaché à un episode à mettre à disposition
                        if (epiIndex > -1) {
                            // L'emplacement du fichier n'est pas encore connu
                            if (!episodes[epiIndex].videoFile) {
                                console.log(`Fichiers : ${JSON.stringify(torrent.files)}`);
                                // On arrête le torrent avant de déplacer le fichier
                                if (torrent.status != 0) {
                                    var videoFile = getVideoFilePath(torrent);
                                    if (videoFile) {
                                        var videoFileName = videoFile.split('/').pop();
                                        // Gérer le cas sans répertoire
                                        console.log(`Fichier vidéo : ${videoFileName}`);

                                        var videoFullPath = `${config.downloadDir}/${videoFile}`;

                                        console.log(`Emplacement vidéo : ${videoFullPath}`);

                                        // On enregistre les infos
                                        episodes[epiIndex].videoPath = videoFullPath;
                                        episodes[epiIndex].videoFileName = videoFileName;
                                        saveEpisodes();

                                        transmission.stop([torrent.id], function (err, arg) {
                                            console.log(`Torrent ${torrent.id} arrêté`);
                                            if (videoFile) {
                                                // On le déplace dans DLNA si on est le serveur transmission
                                                if (config.isTransmissionServer) {
                                                    fs.rename(videoFullPath, `${config.dlnaDir}/${videoFileName}`, () => {
                                                        console.log(`fichier ${videoFileName} déplacé dans dlna`);
                                                    });
                                                }

                                                // Supprimer le répertoire
                                            } else {
                                                console.log(`Pas de fichier vidéo trouvé dans le torrent, fichiers : ${JSON.stringify(torrent.files)}`);
                                            }
                                        });
                                    }
                                } else {
                                    console.log("Torrent déjà arrêté");
                                }
                            }
                        }
                    }
                });
            }
        });
    }
}

function findEpisodeSubtitles() {
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Recherche de sous-titres`);
    if (episodes && episodes.length > 0) {
        OpenSubtitles.login()
            .then(res => {
                console.log(`Token open-subtitles : ${res.token}`);
                var i = episodes.length;
                var promises = [];
                while (i--) {
                    if (episodes[i].videoFileName) {
                        promises.push(((index) => {
                            let defer = Q.defer();
                            OpenSubtitles.search({
                                sublanguageid: 'eng',
                                filename: episodes[index].videoFileName,
                                limit: 'best'
                            }).then((subtitles) => {
                                console.log(`Promesse ${index}`);
                                if (subtitles) {
                                    console.log(`(n°${index + 1}) Sous-titres trouvés pour ${episodes[index].series} S${episodes[index].season}E${episodes[index].number}: ${JSON.stringify(subtitles)}`);
                                    episodes[index].subs = subtitles.en.url;

                                    request.get(subtitles.en.url, function (error, response, fileContent) {
                                        if (!error && response.statusCode == 200) {
                                            var splittedVideoName = episodes[index].videoFileName.split('.');
                                            splittedVideoName[splittedVideoName.length - 1] = "srt";
                                            var subFile = splittedVideoName.join('.');
                                            if (config.isTransmissionServer) {
                                                var file = fs.createWriteStream(`${config.dlnaDir}/${subFile}`);
                                                file.write(fileContent);
                                            } else {
                                                console.log(`${subFile} : longueur ${fileContent.length}`);
                                            }
                                            defer.resolve(index);
                                        } else {
                                            console.log(error);
                                            defer.reject();
                                        }
                                    });
                                } else {
                                    defer.reject();
                                }
                            });

                            return defer.promise;
                        })(i));
                    }
                }
                console.log(`Nombre de promesses sous-titres ${promises.length}`);

                Q.allSettled(promises).then(results => {
                    console.log(`Promesses sous-titres terminées`);
                    var toDestroyIndexes = [];
                    results.forEach((result, index) => {
                        console.log(`Promesse n°${index}, résultat ${result.state}, valeur ${result.value}`);
                        toDestroyIndexes.push(result.value);
                    });
                    console.log(`${toDestroyIndexes.length} épisodes à détruire`);
                    if (toDestroyIndexes.length > 0) {
                        toDestroyIndexes.sort((a, b) => {
                            return b - a;
                        });
                        toDestroyIndexes.forEach((index) => {
                            episodes.splice(index, 1);
                        });

                        saveEpisodes();
                    }
                });
            })
            .catch(err => {
                console.log(err);
            });
    }
}

/* #### FIN DES TACHES #### */

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
                "download-dir": config.downloadDir
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

function getTorrentsStatus() {
    let defer = Q.defer();

    transmission.get(function (err, result) {
        if (err) {
            console.log(err);
        }
        else {
            defer.resolve(result);
        }
    });

    return defer.promise;
}

/*
 STOPPED       : 0  # Torrent is stopped
 CHECK_WAIT    : 1  # Queued to check files
 CHECK         : 2  # Checking files
 DOWNLOAD_WAIT : 3  # Queued to download
 DOWNLOAD      : 4  # Downloading
 SEED_WAIT     : 5  # Queued to seed
 SEED          : 6  # Seeding
 ISOLATED      : 7  # Torrent can't find peers
 */
function getTorrentStatus(id) {
    let defer = Q.defer();

    transmission.get([parseInt(id)], function (err, result) {
        if (err) {
            console.log(err);
        }
        else {
            defer.resolve(result);
        }
    });

    return defer.promise;
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

function getEpisodeIndexFromTorrentName(torrentName) {
    var result = -1;

    if (episodes) {
        episodes.forEach((episode, index) => {
            if (episode.torrentName == torrentName) {
                result = index;
            }
        });
    }

    return result;
}

function getVideoFilePath(torrent) {
    var videoFiles = torrent.files.filter((file)=> {
        var splittedName = file.name.split('.');
        var isVideo = (splittedName[splittedName.length - 1].toLowerCase() == "mkv" ||
        splittedName[splittedName.length - 1].toLowerCase() == "mp4");
        console.log(`${file.name} ${isVideo}`);
        return isVideo;
    });

    console.log(`videoFiles ${JSON.stringify(videoFiles)}`);

    if (videoFiles && videoFiles.length == 1) {
        return videoFiles[0].name;
    } else if (videoFiles && videoFiles.length > 1) {
        return videoFiles.sort((a, b) => {
            return b["length"] - a["length"];
        })[0].name;
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

function saveEpisodes() {
    fs.writeFileSync(path.join(__dirname, '../data/airedEpisodesToProvide.json'), JSON.stringify(episodes, null, 4), 'utf8');
}