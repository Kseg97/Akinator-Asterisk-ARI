/**
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(example)
 *      same => n,Hangup()
 */

'use strict';

var client = require('ari-client'); // Install npm ari-client
var util = require('util');
const aki = require('aki-api'); // Install npm aki-api
const region = 'es';

// --TTS
var googleTTS = require('google-tts-api'); // Install npm google-tts-api
const http = require('http');
const fs = require('fs');
const Lame = require("node-lame").Lame; // Install npm node-lame AND $ sudo apt-get install lame
var path = require('path');
let wav = require('node-wav'); // Install node-wave npm

const dir = './audio-files';

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}
// TTS--


client.connect('http://localhost:8088', 'asterisk', 'asterisk',
  function (err, ari) {

    if (err) {
      throw err; // program will crash if it fails to connect
    }

    // Use once to start the application
    ari.on('StasisStart',
      function (event, incoming) {
        var session = '';
        var signature = '';
        var step = 0;
        // Connect to Akinator API and Start
        aki.start(region)
        .then((response) => {
          // Response = {session, signature, question, answers}
          session = response.session;
          signature = response.signature;

          console.log(JSON.stringify(response));
          text2wav(response.question)
            .then(() => {
              play(incoming, 'sound:http://localhost:8125/audio-files/file.wav'); //https://github.com/pbxware/asterisk-sounds/raw/master/tt-monkeys.wav');//
            })
            .catch((err) => console.log(err));
        })
        .catch((err) => {
          //TODO: Hangup
          console.log(JSON.stringify(err));
        })

        // Handle DTMF events
        incoming.on('ChannelDtmfReceived',
          function (event, channel) {
            const ans = ['1','3','2','4','6'];
            // YES, NO, DONT_KNOW, PROB_YES, PROB_NO
          
            var digit = event.digit;
            //1:0,3:1,2:2 ; 4:3,6:4 <--dial vs answer order

            // If an answer is valid, send to akinator and step up
            if(ans.includes(digit)) {
              const answer = ans.indexOf(digit);
              console.log(answer);

              aki.step(region, session, signature, answer, step)
                .then((response) => {
                  //Response = {nextQuestion,progress, answers,currentStep,nextStep}               
                  
                  console.log(JSON.stringify(response));

                  if(response.progress >= 95) {
                    //TODO: manage win
                    aki.win(region, session, signature, step)
                      .then((response) => {
                        const firstGuess = response.answers[0].name;

                        //console.log(firstGuess);
                        console.log(JSON.stringify(response));
                        //TODO: play final accertion question via TTS with Guests
                        play(channel, 'sound:tt-monkeys'); //
                      })
                      .catch((err) => {
                        //TODO: Hangup
                        console.log(JSON.stringify(err));
                      })
                  } else {
                    text2wav(response.nextQuestion)
                      .then(() => {
                        play(channel, 'sound:http://localhost:8125/audio-files/file.wav'); //https://github.com/pbxware/asterisk-sounds/raw/master/tt-monkeys.wav');//
                      })
                      .catch((err) => console.log(err));
                  }       
                  step = response.nextStep;   
                })
                .catch((err) => {
                  //TODO: Hangup
                  console.log(JSON.stringify(err));
                })
            }

            switch (digit) {       
              case '#':
                play(channel, 'sound:vm-goodbye', function (err) {
                  channel.hangup(function (err) {
                    process.exit(0);
                  });
                });
                break;
              case '*':
                play(channel, 'sound:tt-monkeys');
                break;
              // default:
              //   play(channel, util.format('sound:digits/%s', digit));
            }
          });

          // incoming.answer(function (err) {
          //   play(incoming, 'sound:hello-world');
          // });
        });

      function play (channel, sound, callback) {
        var playback = ari.Playback();
        playback.once('PlaybackFinished',
          function (event, instance) {

            if (callback) {
              callback(null);
            }
          });
        channel.play({media: sound}, playback, function (err, playback) {});
      }

    // can also use ari.start(['app-name'...]) to start multiple applications
    ari.start('example');
  });

  // TODO: implement hashes or audio identifiers for multiple users
  const text2wav = (text) => {
    return new Promise((resolve, reject) => {
      googleTTS(text, 'es', 1)   // speed normal = 1 (default), slow = 0.24
        .then(function (url) {
            console.log(url); // https://translate.google.com/translate_tts?...

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
                            // Conversion from 24kHz to 8KHz
                            let buffer = fs.readFileSync('./audio-files/file.wav');
                            let result = wav.decode(buffer);
                            // At 24.000 sample rate
                            var highlySampledData = Object.assign(result.channelData[0]);
                            // At 8.000 sample rate
                            var downsampledData = new Float32Array(highlySampledData.length/3);
                            for(var i = 0; i < highlySampledData.length/3; i++){ // 24/8 = 3
                              downsampledData[i] = highlySampledData[i*3];
                            }                      
                            let output = wav.encode([downsampledData], { sampleRate: 8000, float: false, bitDepth: 16 });
                            
                            fs.writeFileSync('./audio-files/file.wav', output);
                            resolve();
                        })
                        .catch(error => {
                            console.log(error);
                            reject(error);
                        });
                });
            });
        })
        .catch(function (err) {
            console.error(err.stack);
            reject(error);
        });
    })    
  }


//To access WAV as URL (HTTP) at http://localhost:8125/audio-files/file.wav
http.createServer(function (request, response) {
  console.log('request starting...');

  var filePath = '.' + request.url;
  if (filePath == './')
      filePath = './audio-files/file.wav';

  var contentType = 'audio/wav';
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
