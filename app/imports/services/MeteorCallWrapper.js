// Centralized client-side wrapper around Meteor.call: every UI -> server call
// goes through here (loading flag, error surface, token-first signature kept for
// pattern compatibility — auth itself is Meteor accounts / this.userId).
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';

class MeteorCallWrapper {
  /**
   * @param {string} methodName
   * @param {Object} [params]
   * @param {Object} [options]
   * @param {string}   [options.loading]   Session key toggled true/false around the call.
   * @param {Function} [options.onSuccess]
   * @param {Function} [options.onFail]
   * @returns {Promise}
   */
  static call(methodName, params = {}, options = {}) {
    const { loading, onSuccess, onFail } = options;
    if (loading) Session.set(loading, true);

    return new Promise((resolve, reject) => {
      Meteor.call(methodName, null /* token slot */, params, (error, result) => {
        if (loading) Session.set(loading, false);
        if (error) {
          console.error(`Meteor.call ${methodName} error:`, error);
          if (onFail) onFail(error);
          reject(error);
          return;
        }
        if (onSuccess) onSuccess(result);
        resolve(result);
      });
    });
  }
}

export default MeteorCallWrapper;
