/**
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(example)
 *      same => n,Hangup()
 */

'use strict';

// Import required modules.
const fs = require('fs');
var util = require('util');
var path = require('path');
const http = require('http');                  // Install HTTP module for general purpose requests and instantiation.
let wav = require('node-wav');                 // Install node-wave npm.
const aki = require('aki-api');                // Install npm aki-api.
var client = require('ari-client');            // Install npm ari-client.
const Lame = require("node-lame").Lame;        // Install npm node-lame AND $ sudo apt-get install lame.
var googleTTS = require('google-tts-api');     // Install npm google-tts-api.

// Set required constants.
const region = 'es';                           // Set Google TTS and Aki API locale.
const dir = './audio-files';                   // Set root directory for audio files.
const asteriskHost = 'http://localhost:8088';  // Set Asterisk host URI.
const asteriskUser = 'asterisk';               // Set Asterisk ARI user.
const asteriskPassword = 'asterisk';           // Set Asterisk ARI password.

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}

client.connect(asteriskHost, asteriskUser, asteriskPassword,
  function (err, ari) {

    if (err) {
      throw err; // App will crash if it fails to connect.
    }

    // Use once to start the application.
    ari.on('StasisStart',
      function (event, incoming) {
        var session = '';
        var signature = '';
        var step = 0;
        // Play instruction set of the game.
        // text2wav("start", "¡Hola, soy Aki!; para responder sí, oprime 1, para no, oprime 2, para no lo sé, oprime 3, para probablemente, oprime 4 y para probablemente no, oprime 5.")
        play(incoming, 'sound:http://localhost:8125/audio-files/start.wav');
        // Connect to Akinator API and Start
        aki.start(region)
        .then((response) => {
          // Response = {session, signature, question, answers}
          session = response.session;
          signature = response.signature;

          console.log(JSON.stringify(response));
          text2wav("file", response.question)
            .then(() => {
              play(incoming, 'sound:http://localhost:8125/audio-files/file.wav'); 
            })
            .catch((err) => console.log(err));
        })
        .catch((err) => {
          console.log(JSON.stringify(err));
          play(channel, 'sound:vm-goodbye', function (err) { 
            channel.hangup(function (err) {
              process.exit(0);
            });
          });
        })

        // Handle DTMF events.
        incoming.on('ChannelDtmfReceived',
          function (event, channel) {
            const ans = ['1','2','3','4','5'];
            // YES, NO, DONT_KNOW, PROB_YES, PROB_NO
          
            var digit = event.digit;
            console.log("Digit: " + digit);

            // If an answer is valid, send to akinator and step up.
            if(ans.includes(digit)) {
              console.log("Answer: " + ans[digit]);
              const answer = ans.indexOf(digit);
              console.log(answer);

              aki.step(region, session, signature, answer, step)
                .then((response) => {
                  //Response = {nextQuestion,progress, answers,currentStep,nextStep}               
                  
                  console.log(JSON.stringify(response.nextQuestion));

                  if(response.progress >= 85) {
                    aki.win(region, session, signature, parseInt(step)+1)
                      .then((response) => {
                        const firstGuess = response.answers[0].name;

                        console.log(firstGuess);
                        // console.log(JSON.stringify(response));
                        text2wav("file", "Tu personaje es "+firstGuess)
                        .then(() => {
                          play(incoming, 'sound:http://localhost:8125/audio-files/file.wav'); 
                        })
                        .catch((err) => console.log(err));
                        // TODO: Handle win DTMF.
                      })
                      .catch((err) => {
                        console.log(JSON.stringify(err));
                        play(channel, 'sound:vm-goodbye', function (err) {
                          channel.hangup(function (err) {
                            process.exit(0);
                          });
                        });
                      })
                  } else {
                    text2wav("file", response.nextQuestion)
                      .then(() => {
                        play(channel, 'sound:http://localhost:8125/audio-files/file.wav'); 
                      })
                      .catch((err) => console.log(err));
                  }       
                  step = response.nextStep;   
                })
                .catch((err) => {
                  console.log(JSON.stringify(err));
                  play(channel, 'sound:vm-goodbye', function (err) {
                    channel.hangup(function (err) {
                      process.exit(0);
                    });
                  });
                })
            } else if (digit == "#") {
              play(channel, 'sound:vm-goodbye', function (err) {
                channel.hangup(function (err) {
                  process.exit(0);
                });
              });
            } else { 
              // TODO: Add right key audio prompt.
              play(channel, 'sound:tt-monkeys');              
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

    // Can also use ari.start(['app-name'...]) to start multiple applications.
    ari.start('example');
  });

  // TODO: Implement hashes or audio identifiers for multiple users
  const text2wav = (fileName, text) => {
    return new Promise((resolve, reject) => {
      googleTTS(text, 'es', 1)   // speed normal = 1 (default), slow = 0.24
        .then(function (url) {
            // console.log(url); // https://translate.google.com/translate_tts?...

            const file = fs.createWriteStream("./audio-files/"+fileName+".mp3");
            http.get(url.replace('https', 'http'), function (response) {
                response.pipe(file).on('finish', function () {

                    console.log('File saved!');

                    const decoder = new Lame({
                        output: "./audio-files/"+fileName+".wav"
                    }).setFile("./audio-files/"+fileName+".mp3");

                    decoder
                        .decode()
                        .then(() => {
                            console.log('File converted!');
                            // Conversion from 24kHz to 8KHz
                            let buffer = fs.readFileSync('./audio-files/'+fileName+'.wav');
                            let result = wav.decode(buffer);
                            // At 24.000 sample rate
                            var highlySampledData = Object.assign(result.channelData[0]);
                            // At 8.000 sample rate
                            var downsampledData = new Float32Array(highlySampledData.length/3);
                            for(var i = 0; i < highlySampledData.length/3; i++){ // 24/8 = 3
                              downsampledData[i] = highlySampledData[i*3];
                            }                      
                            let output = wav.encode([downsampledData], { sampleRate: 8000, float: false, bitDepth: 16 });
                            
                            fs.writeFileSync('./audio-files/'+fileName+'.wav', output);
                            console.log("File name: "+fileName);
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


// To access WAV as URL (HTTP) at http://localhost:8125/audio-files/file.wav
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
