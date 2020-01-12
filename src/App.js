'use strict'

const express = require('express');
const environmentVars = require('dotenv').config(); // ?

// Google Cloud
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient();
const fetch = require("node-fetch");


const app = express();
const port = process.env.PORT || 1337;
const server = require('http').createServer(app);

const io = require('socket.io')(server);

app.use('/assets', express.static(__dirname + '/public'));
app.use('/session/assets', express.static(__dirname + '/public'));
app.set('view engine', 'ejs');


// =========================== ROUTERS ================================ //

app.get('/', function (req, res) {
    res.render('index', {});
});

app.use('/', function (req, res, next) {
    next();
});


// =========================== SOCKET.IO ================================ //

io.on('connection', function (client) {
    console.log('Client Connected to server');
    let recognizeStream = null;
    let speechToText = "";

    client.on('join', function (data) {
        client.emit('messages', 'Socket Connected to Server');
    });

    client.on('messages', function (data) {
        client.emit('broad', data);
    });

    client.on('startGoogleCloudStream', function (data) {
        startRecognitionStream(this, data);
    });

    client.on('endGoogleCloudStream', function (data, fn) {
        stopRecognitionStream(fn, data);
        // console.log("FINAL: " + speechToText);
        // fn(speechToText);
    });

    client.on('binaryData', function (data) {
        if (recognizeStream !== null) {
            recognizeStream.write(data);
        }
    });

    function startRecognitionStream(client, data) {
        recognizeStream = speechClient.streamingRecognize(request)
            .on('error', console.error)
            .on('data', (data) => {

                client.emit('speechData', data);
                // send result
                if (data.results[0] && data.results[0].isFinal) {
                    process.stdout.write(data.results[0].alternatives[0].transcript + "\n");
                    if (speechToText == "") {
                        speechToText = data.results[0].alternatives[0].transcript;
                    } else {
                        speechToText = speechToText + " " + data.results[0].alternatives[0].transcript;
                    }
                    stopRecognitionStream();
                    startRecognitionStream(client);
                }
            });
    }

    function stopRecognitionStream(fn, data) {
        if (recognizeStream) {
            recognizeStream.end();
        }
        if (fn) {
            const fetchObj = {
                body: "text=" + speechToText,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Aylien-Textapi-Application-Id": "097ff773",
                    "X-Aylien-Textapi-Application-Key": "a5687de44d5585e08b4fd26770f2df1c"
                },
                method: "POST"
            };

            fetch("https://api.aylien.com/api/v1/concepts", fetchObj)
                .then((response) => response.json())
                .then((content) => {
                    let keyWord = null;
                    try {
                        keyWord = content["concepts"][Object.keys(content["concepts"])[0]]["surfaceForms"][0]["string"];
                    } catch (err) {
                        process.stdout.write("cannot find key word for title\n");
                    }

                    if (keyWord) {
                        fetchObj["body"] = "title=" + keyWord + "&" + fetchObj["body"];
                    } else {
                        fetchObj["body"] = "title=&" + fetchObj["body"];
                    }
                    fetchObj["body"] = "sentences_percentage=50&" + fetchObj["body"];

                    process.stdout.write(JSON.stringify(fetchObj));

                    fetch("https://api.aylien.com/api/v1/summarize", fetchObj)
                        .then((response) => response.json())
                        .then((content1) => {
                            // console.log("CONTENT.sentence: " + content1.sentences);
                            // process.stdout.write(JSON.stringify(content.text));
                            client.emit('resultText', JSON.stringify(content1.sentences));
                            speechToText = "";
                        });
                });
        }
        recognizeStream = null;
    }

});



// =========================== GOOGLE CLOUD SETTINGS ================================ //

// The encoding of the audio file, e.g. 'LINEAR16'
// The sample rate of the audio file in hertz, e.g. 16000
// The BCP-47 language code to use, e.g. 'en-US'
const encoding = 'LINEAR16';
const sampleRateHertz = 16000;
const languageCode = 'en-US';

const request = {
    config: {
        encoding: encoding,
        sampleRateHertz: sampleRateHertz,
        languageCode: languageCode,
        profanityFilter: false,
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true,
    },
    interimResults: false
};


// =========================== START SERVER ================================ //

server.listen(port, "127.0.0.1", function () {
    // app.address = "127.0.0.1";
    console.log('Server started on port:' + port)
});
