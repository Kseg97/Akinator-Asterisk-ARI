var googleTTS = require('google-tts-api'); // Install google-tts-api
const http = require('http');
const fs = require('fs');
const Lame = require("node-lame").Lame; // Install node-lame AND $ sudo apt-get install lame
var path = require('path');

const dir = './audio-files';

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}

googleTTS('Hola, mi nombre es Camilo y no sé por qué', 'es', 1)   // speed normal = 1 (default), slow = 0.24
    .then(function (url) {
        console.log(url); // https://translate.google.com/translate_tts?...
        console.log(`http://api.rest7.com/v1/sound_convert.php?url=${url}&format=wav`);


        const file = fs.createWriteStream("./audio-files/file.mp3");
        http.get(url.replace('https', 'http'), function (response) {
            response.pipe(file).on('finish', function () {

                console.log('File saved!');

                const decoder = new Lame({
                    output: "./audio-files/file.wav"
                }).setFile("./audio-files/file.mp3");

                decoder
                    .decode()
                    .then(() => {
                        console.log('File converted!');
                    })
                    .catch(error => {
                        console.log(error);
                    });
            });
        });
    })
    .catch(function (err) {
        console.error(err.stack);
    });

//To access WAV as URL (HTTP) at http://localhost:8125/audio-files/file.wav
http.createServer(function (request, response) {
    console.log('request starting...');

    var filePath = '.' + request.url;
    if (filePath == './')
        filePath = './audio-files/file.wav';

    contentType = 'audio/wav';
    fs.readFile(filePath, function (error, content) {
        if (error) {
            if (error.code == 'ENOENT') {
                fs.readFile('./404.html', function (error, content) {
                    response.writeHead(200, { 'Content-Type': contentType });
                    response.end(content, 'utf-8');
                });
            }
            else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
                response.end();
            }
        }
        else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });

}).listen(8125);
console.log('Server running at http://127.0.0.1:8125/');