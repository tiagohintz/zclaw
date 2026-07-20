import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import './login.html';

Template.Page_login.onCreated(function () {
  this.isRegistering = new ReactiveVar(false);
  this.error = new ReactiveVar(null);
  this.busy = new ReactiveVar(false);
});

Template.Page_login.helpers({
  isRegistering: () => Template.instance().isRegistering.get(),
  error: () => Template.instance().error.get(),
  busy: () => Template.instance().busy.get(),
});

Template.Page_login.events({
  'click .js-toggle-mode'(event, instance) {
    instance.isRegistering.set(!instance.isRegistering.get());
    instance.error.set(null);
  },

  'submit #login-form'(event, instance) {
    event.preventDefault();
    const email = event.target.email.value.trim();
    const password = event.target.password.value;
    instance.busy.set(true);
    instance.error.set(null);

    const done = (err) => {
      instance.busy.set(false);
      if (err) {
        instance.error.set(err.reason || 'Não foi possível entrar. Tente novamente.');
        return;
      }
      FlowRouter.go('/');
    };

    if (instance.isRegistering.get()) {
      Accounts.createUser({ email, password }, done);
    } else {
      Meteor.loginWithPassword(email, password, done);
    }
  },
});
