'use strict'

const socket = io.connect();

//================= CONFIG =================
// Stream Audio
let bufferSize = 2048,
	AudioContext,
	context,
	processor,
	input,
	globalStream;

//vars
let resultText = document.getElementById('ResultText'),
	streamStreaming = false;


//audioStream constraints
const constraints = {
	audio: true,
	video: false
};

//================= RECORDING =================



function initRecording() {
	socket.emit('startGoogleCloudStream', '');
	streamStreaming = true;
	AudioContext = window.AudioContext || window.webkitAudioContext;
	context = new AudioContext({
		latencyHint: 'interactive',
	});
	processor = context.createScriptProcessor(bufferSize, 1, 1);
	processor.connect(context.destination);
	context.resume();

	var handleSuccess = function (stream) {
		globalStream = stream;
		input = context.createMediaStreamSource(stream);
		input.connect(processor);

		processor.onaudioprocess = function (e) {
			microphoneProcess(e);
		};
	};

	navigator.mediaDevices.getUserMedia(constraints)
		.then(handleSuccess);

}

function microphoneProcess(e) {
	var buffer = e.inputBuffer.getChannelData(0);
	var downSampledBuffer = downsampleBuffer(buffer, 44100, 16000);
	socket.emit('binaryData', downSampledBuffer);
}




//================= INTERFACE =================
var startButton = document.getElementById("startRecButton");
startButton.addEventListener("click", startRecording);

var endButton = document.getElementById("stopRecButton");
endButton.addEventListener("click", stopRecording);
endButton.disabled = true;

var recordingStatus = document.getElementById("recordingStatus");

var lightingMode = document.getElementById("lightingMode");
lightingMode.addEventListener("click", changeLightingMode);

var clipboard = document.getElementById("copyToClipboard");
clipboard.addEventListener("click", copyToClipboard);

function copyToClipboard() {
    let textArea = document.getElementById("resultText");
    textArea.select();
    document.execCommand("copy");
}

function changeLightingMode() {
    document.body.classList.toggle("dark-mode");
    document.getElementById("startRecButton").classList.toggle("dark-mode");
	document.getElementById("stopRecButton").classList.toggle("dark-mode");
	document.getElementsByClassName("resultText")[0].classList.toggle("dark-mode");
}

function startRecording() {
	startButton.disabled = true;
	endButton.disabled = false;
	recordingStatus.style.visibility = "visible";
	initRecording();
}

function stopRecording() {
	// waited for FinalWord
	startButton.disabled = false;
	endButton.disabled = true;
	recordingStatus.style.visibility = "hidden";
	streamStreaming = false;
	socket.emit('endGoogleCloudStream', '');


	let track = globalStream.getTracks()[0];
	track.stop();

	input.disconnect(processor);
	processor.disconnect(context.destination);
	context.close().then(function () {
		input = null;
		processor = null;
		context = null;
		AudioContext = null;
		startButton.disabled = false;
	});
}

//================= SOCKET IO =================
socket.on('connect', function (data) {
	socket.emit('join', 'Server Connected to Client');
});

socket.on('resultText', function(data) {
    document.getElementById("resultText").value += data;
});

socket.on('messages', function (data) {
	console.log("hi");
	console.log(data);
});

window.onbeforeunload = function () {
	if (streamStreaming) { socket.emit('endGoogleCloudStream', ''); }
};

var downsampleBuffer = function (buffer, sampleRate, outSampleRate) {
	if (outSampleRate == sampleRate) {
		return buffer;
	}
	if (outSampleRate > sampleRate) {
		throw "downsampling rate show be smaller than original sample rate";
	}
	var sampleRateRatio = sampleRate / outSampleRate;
	var newLength = Math.round(buffer.length / sampleRateRatio);
	var result = new Int16Array(newLength);
	var offsetResult = 0;
	var offsetBuffer = 0;
	while (offsetResult < result.length) {
		var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
		var accum = 0, count = 0;
		for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
			accum += buffer[i];
			count++;
		}

		result[offsetResult] = Math.min(1, accum / count) * 0x7FFF;
		offsetResult++;
		offsetBuffer = nextOffsetBuffer;
	}
	return result.buffer;
}