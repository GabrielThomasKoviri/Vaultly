import { Alert as NativeAlert } from 'react-native';

let alertListener = null;

export const registerAlertListener = (listener) => {
  alertListener = listener;
};

function sanitizeMessage(message) {
  if (!message) return message;
  
  let msgString = '';
  if (typeof message !== 'string') {
    if (message.message) {
      msgString = message.message;
    } else {
      msgString = String(message);
    }
  } else {
    msgString = message;
  }
  
  const lower = msgString.toLowerCase();
  
  // Keywords indicating JavaScript runtime errors, variable issues, database errors, or system pointers
  const programErrorKeywords = [
    'referenceerror',
    'typeerror',
    'rangeerror',
    'syntaxerror',
    'urierror',
    'undefined',
    'not a function',
    'not defined',
    'cannot read',
    "can't find variable",
    'null is not',
    'sqlite',
    'sql',
    'no such table',
    'no such column',
    'database',
    'pointer',
    'segmentation',
    'unhandled',
    'native',
    'internal error',
    'unexpected token',
    'filesystem',
    'ioexception',
    'permission denied',
    'failed to copy',
    'failed to read',
    'failed to write',
    'failed to crop',
    'failed to manipulate',
    'launchimagelibraryasync',
    'getdocumentasync'
  ];

  const containsKeyword = programErrorKeywords.some(keyword => lower.includes(keyword));
  
  if (containsKeyword) {
    return 'Something went wrong. Please try again.';
  }
  
  return msgString;
}

export const Alert = {
  alert: (title, message, buttons) => {
    const finalMessage = sanitizeMessage(message);
    if (alertListener) {
      alertListener(title, finalMessage, buttons);
    } else {
      NativeAlert.alert(title, finalMessage, buttons);
    }
  }
};

export default Alert;
