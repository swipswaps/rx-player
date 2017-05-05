/**
 * # Player Module
 *
 * Instanciate a new RxPlayer, link its state and this module's state, provide
 * actions to allow easy interactions with the player to the rest of the
 * application.
 */

const RxPlayer = require("../../../../src");
const { linkPlayerEventsToState } = require("./events.js");

const PLAYER = ({ $destroy, $state }, { videoElement }) => {
  const player = new RxPlayer({ videoElement });

  // facilitate DEV mode
  window.player = window.rxPlayer = player;

  // initial state. Written here to easily showcase it exhaustively
  $state.next({
    audioBitrateAuto: true,
    audioBitrate: undefined,
    availableAudioBitrates: [],
    availableLanguages: [],
    availableVideoBitrates: [],
    availableSubtitles: [],
    bufferGap: undefined,
    currentTime: undefined,
    duration: undefined,
    error: null,
    hasEnded: false,
    hasLoadedContent: false,
    images: [],
    isBuffering: false,
    isFullscreen: player.isFullscreen(),
    isLive: false,
    isLoading: false,
    isPaused: false,
    isSeeking: false,
    isStopped: true,
    language: undefined,
    loadedVideo: null,
    speed: 0,
    subtitle: undefined,
    videoBitrateAuto: true,
    videoBitrate: undefined,
    volume: player.getVolume(),
  });

  linkPlayerEventsToState(player, $state, $destroy);

  // dispose of the RxPlayer when destroyed
  $destroy.subscribe(() => player.dispose());

  return {
    SET_VOLUME: (volume) => {
      player.setVolume(volume);
    },

    SET_POSITION: (position) => {
      player.setPosition(position);
    },

    LOAD: (arg) => {
      player.loadVideo(arg);
      $state.next({ loadedVideo: arg });
    },

    PLAY: () => {
      player.play();

      const currentState = $state.getValue();

      if (
        !currentState.isStopped &&
        !currentState.hasEnded
      ) {
        $state.next({ isPaused: false });
      }
    },

    PAUSE: () => {
      player.pause();

      const currentState = $state.getValue();

      if (
        !currentState.isStopped &&
        !currentState.hasEnded
      ) {
        $state.next({ isPaused: true });
      }
    },

    STOP: () => {
      player.stop();
    },

    SEEK: (position) => {
      player.seekTo(position);
    },

    MUTE: () => {
      player.mute();
    },

    UNMUTE: () => {
      player.unMute();
    },

    SET_FULL_SCREEN: () => {
      player.setFullscreen();
    },

    EXIT_FULL_SCREEN: () => {
      player.setFullscreen(false);
    },

    SET_AUDIO_BITRATE: (bitrate) => {
      player.setAudioBitrate(bitrate || 0);
      $state.next({
        audioBitrateAuto: !bitrate,
      });
    },

    SET_VIDEO_BITRATE: (bitrate) => {
      player.setVideoBitrate(bitrate || 0);
      $state.next({
        videoBitrateAuto: !bitrate,
      });
    },

    SET_AUDIO_TRACK: (track) => {
      player.setLanguage(track);
    },

    SET_SUBTITLES_TRACK: (track) => {
      player.setSubtitle(track);
    },
  };
};

module.exports = PLAYER;