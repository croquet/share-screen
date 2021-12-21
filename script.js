/* global Croquet, AgoraRTC Swal */

import apiKey from "./apiKey.js";
import agoraId from "./agoraId.js";

class Model extends Croquet.Model {
    init() {
        super.init();

        this.viewIds = [];
        this.sharingViewId = null;

        this.subscribe(this.sessionId, 'view-join', this.onViewJoin);
        this.subscribe(this.sessionId, 'view-exit', this.onViewExit);

        this.subscribe(this.id, 'share-screen', this.onShareScreen);
        this.subscribe(this.id, 'stop-sharing-screen', this.onStopSharingScreen);
    }

    onViewJoin(viewId) {
        if (!this.viewIds.includes(viewId)) {
            this.viewIds.push(viewId);
            this.publish(this.id, 'view-joined', viewId);
        }
    }

    onViewExit(viewId) {
        if (this.viewIds.includes(viewId)) {
            this.viewIds.splice(this.viewIds.indexOf(viewId), 1);
            this.publish(this.id, 'view-exited', viewId);

            if (viewId === this.sharingViewId) {
                this.onStopSharingScreen(viewId);
            }
        }
    }

    get isAlone() { return this.viewIds.length < 2; }
    get isSomeoneSharing() { return !!this.sharingViewId; }
    get canShareScreen() { return !this.isAlone && !this.isSomeoneSharing; }

    onShareScreen(viewId) {
        if (this.canShareScreen) {
            this.sharingViewId = viewId;
            this.publish(this.id, 'sharing-screen', viewId);
        }
    }

    onStopSharingScreen(viewId) {
        if (this.sharingViewId === viewId) {
            this.sharingViewId = null;
        }

        this.publish(this.id, 'stopped-sharing-screen', viewId);
    }
}

Model.register('Model');

class View extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;

        Croquet.Messenger.startPublishingPointerMove();

        this.elements = {
            ui: document.getElementById('ui'),

            clickToShareScreen: document.getElementById(`clickToShareScreen`),
            screen: document.getElementById('screen'),

            toggleVideo: document.getElementById('toggleVideo'),
            toggleAudio: document.getElementById('toggleAudio'),
            stopSharingScreen: document.getElementById('stopSharingScreen'),
            screenProfiles: document.getElementById('screenProfiles'),
        };

        this.addEventListener(document, 'wheel', evt => evt.preventDefault(), {passive: false});

        this.addEventListener(this.elements.clickToShareScreen, 'click', this.shareScreen.bind(this));

        this.addEventListener(this.elements.toggleVideo, 'click', this.toggleVideo.bind(this));
        this.addEventListener(this.elements.toggleAudio, 'click', this.toggleAudio.bind(this));
        this.addEventListener(this.elements.stopSharingScreen, 'click', this.stopSharingScreen.bind(this));

        // CLIENT
        this.appID = agoraId;
        this.client = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'});

        // SUBSCRIBE
        this.subscribe(this.model.id, 'view-joined', this.onViewJoined.bind(this));
        this.subscribe(this.model.id, 'view-exited', this.onViewExited.bind(this));

        this.subscribe(this.model.id, 'sharing-screen', this.onSharingScreen.bind(this));
        this.subscribe(this.model.id, 'stopped-sharing-screen', this.onStoppedSharingScreen.bind(this));

        this.client.join(this.appID, sessionConfiguration.channelName, null).then(uid => {
            this.uid = uid;
            this.client.on('user-published', this.onUserPublished.bind(this));
            this.client.on('user-unpublished', this.onUserUnpublished.bind(this));
            if (this.model.isSomeoneSharing) {
                this.onSharingScreen();
            } else {
                this.refreshUIState();
            }
        });
    }

    // EVENT LISTENERS
    addEventListener(element, type, _eventListener, options) {
        this._eventListeners = this._eventListeners || [];

        const eventListener = _eventListener.bind(this);
        element.addEventListener(type, eventListener, options);
        this._eventListeners.push({element, type, eventListener, _eventListener});
    }

    removeEventListener(element, type, eventListener) {
        const record = this._eventListeners.find(rec => rec.element === element && rec.type === type && rec._eventListener === eventListener);
        if (record) element.removeEventListener(type, record.eventListener);
    }

    removeEventListeners() {
        this._eventListeners.forEach(({element, type, eventListener}) => {
            element.removeEventListener(type, eventListener);
        });
    }

    // VIEWS
    shareScreen() {
        if (!this.uid) {return;}
        this.publish(this.model.id, 'share-screen', this.viewId);
        AgoraRTC.createScreenVideoTrack({encoderConfig: this.screenProfile}, "auto").then(tracks => {
            let v, a;
            if (tracks.constructor === Array) {
                v = tracks[0];
                a = tracks[1];
            } else {
                v = tracks;
            }
            const publish = [];
            this.videoTrack = v;
            this.videoEnabled = !!v;
            if (v) {
                publish.push(v);
            }

            this.audioTrack = a;
            this.audioEnabled = !!a;
            if (a) {
                this.setClass(this.elements.ui, true, "hasAudio");
                publish.push(a);
            }
            return this.client.publish(publish);
        }).then(() => {
            this.playVideoTrack(this.videoTrack);
        }).catch(_err => {
            Swal.fire(`Unable to share screen. Make sure you've allowed this page to see your screen. On Mac, you can check if you've given this browser access to the screen under "Settings > Security & Privacy > Screen Recording`);
            this.closeTracks();
            this.refreshUIState();
        });
    }

    stopSharingScreen() {
        if (this.model.isSomeoneSharing) {
            this.closeTracks();
            this.publish(this.model.id, "stop-sharing-screen", this.viewId);
        }
    }

    onViewJoined() {
        this.refreshUIState();
    }

    onViewExited() {
        this.refreshUIState();
    }

    onSharingScreen() {
        this.refreshUIState();
    }

    onStoppedSharingScreen() {
        this.refreshUIState();
    }

    setClass(elem, flag, cls) {
        if (flag) {
            elem.classList.add(cls);
        } else {
            elem.classList.remove(cls);
        }
    }

    refreshUIState() {
        const {isAlone, isSomeoneSharing, sharingViewId} = this.model;
        const ui = this.elements.ui;

        this.setClass(ui, isAlone, "alone");
        this.setClass(ui, isSomeoneSharing, "someoneSharing");
        this.setClass(ui, sharingViewId === this.viewId, "sharingLocalScreen");
    }

    async onUserPublished(user, mediaType) {
        await this.client.subscribe(user, mediaType);

        if (mediaType === "video") {
            this.playVideoTrack(user.videoTrack);
        }

        if (mediaType === "audio") {
            this.playAudioTrack(user.audioTrack);
        }
    }

    onUserUnpublished() {
        // may be called twice for video and audio;
        this.elements.screen.innerHTML = "";
    }

    playVideoTrack(track) {
        this.elements.screen.innerHTML = '';
        track.play('screen', {fit: 'contain', muted: (this.videoTrack === track)});
    }

    playAudioTrack(track) {
        track.play();
    }

    // SCREEN PROFILE
    get screenProfile() {return this.elements.screenProfiles.value;}


    // CLIENT
    get isClientConnected() {
        return this.client.connectionState === 'CONNECTED';
    }

    // TOGGLE
    toggleVideo() {
        if (!this.videoTrack) {return;}
        this.setVideoState(!this.videoEnabled);
    }

    setVideoState(flag) {
        this.videoTrack.setEnabled(flag);
        this.videoEnabled = flag;
        this.setClass(this.elements.ui, !flag, "mute-video");
    }

    toggleAudio() {
        if (!this.audioTrack) {return;}
        this.setAudioState(!this.audioEnabled);
    }

    setAudioState(flag) {
        this.audioTrack.setEnabled(flag);
        this.audioEnabled = flag;
        this.setClass(this.elements.ui, !flag, "mute-audio");
    }

    closeTracks() {
        if (this.videoTrack || this.audioTrack) {
            const unpublish = [];
            if (this.videoTrack) {
                this.videoTrack.stop();
                this.videoTrack.close();
                unpublish.push(this.videoTrack);
            }
            if (this.audioTrack) {
                this.audioTrack.stop();
                this.audioTrack.close();
                unpublish.push(this.audioTrack);
            }
            this.client.unpublish(unpublish);
        }
    }

    detach() {
        super.detach();
        this.removeEventListeners();
        this.closeTracks();
        this.client.leave();
    }
}

const {searchParams} = (new URL(window.location));
const sessionConfiguration = {
    channelName: searchParams.get('q') || searchParams.get('c') || ' ',
    nickname: searchParams.get('nickname') || searchParams.get('n') || '',
    initials: searchParams.get('initials') || searchParams.get('i') || '',
    viewColor: searchParams.get('viewColor') || searchParams.get('userColor') || searchParams.get('h') || `hsl(${Math.floor(Math.random()*255)}, 40%, 40%)`,
};

let session;
function joinSession() {
    const joinArgs = {
        appId: 'io.croquet.sharescreen',
        apiKey, 
        name: sessionConfiguration.channelName,
        password: 'dummy-pass',
        model: Model,
        view: View,
        autoSleep: false,
        tps: 0,
        viewIdDebugSuffix: sessionConfiguration.initials
    };
    Croquet.Session.join(joinArgs).then(s => {
        session = s;
        // Croquet.App.makeSessionWidgets();
        // Croquet.App.makeWidgetDock();
    });
}

if (window.parent === window) {
    joinSession();
}
else {
    const timeoutId = window.setTimeout(() => {
        joinSession();
    }, 500);

    const receiver = {
        init() {
            Croquet.Messenger.setReceiver(this);
            Croquet.Messenger.on("sessionInfo", "onSessionInfo");
            Croquet.Messenger.on("userInfo", "onUserInfo");
            Croquet.Messenger.send("sessionInfoRequest");
            Croquet.Messenger.send("userInfoRequest");
        },

        onSessionInfo({sessionHandle, sessionName}) {
            sessionConfiguration.sessionHandle = sessionHandle;
            sessionConfiguration.sessionName = sessionName;

            //sessionConfiguration.channelName = sessionHandle.slice(0, 8);

            this.receivedSessionInfo = true;
            this.checkIfReadyToJoinSession();
        },
        receivedSessionInfo: false,

        onUserInfo({nickname, initials, userColor}) {
            if (nickname) {
                sessionConfiguration.nickname = nickname;
            }

            if (initials) {
                sessionConfiguration.initials = initials;
            }

            if (userColor) {
                sessionConfiguration.userColor = userColor;
                sessionConfiguration.viewColor = userColor;
            }

            this.receivedUserInfo = true;
            this.checkIfReadyToJoinSession();
        },
        receivedUserInfo: false,

        get receivedAllData() {return this.receivedSessionInfo && this.receivedUserInfo;},
        checkIfReadyToJoinSession() {
            if (this.receivedAllData && !session && sessionConfiguration.fromLandingPage) {
                clearTimeout(timeoutId);
                joinSession();
            }
        },
    };
    receiver.init();
}
