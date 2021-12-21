# Croquet Share Screen

## Introduction

The Croquet Share Screen allows a user to share the computer screen to other participants. It uses the third party library from [agora.io](https://agora.io).

## Code Organization

All logic is in `script.js`. it is loaded from `index.html`, along with the bundled Croquet library and Sweet Alert.  

You need to create two files called `apiKey.js` and `agoraId.js`. You can copy `apiKey.js-example` to `apiKey.js` and replace the value with your apiKey obtained from [Croquet Dev Portal](croquet.io/keys):

   ```JavaScript
   const apiKey = "<insert your apiKey from croquet.io/keys>";
   export default apiKey;
   ```

Also, you can copy `agoraId.js-example` to `agoraId.js` and replace the value with your Agora App ID.

## Testing
as `apiKey.js` and `agoraId.js` are loaded as a ES6 module, the files have to be served by a server running on a local computer or otherwise.

