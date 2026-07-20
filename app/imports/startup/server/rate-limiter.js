// Protect sensitive methods from brute force by throttling per DDP connection.
import { Meteor } from 'meteor/meteor';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

// Built-in accounts methods: 5 attempts / 60s per connection.
const accountsMethods = ['login', 'createUser', 'forgotPassword', 'resetPassword'];

DDPRateLimiter.addRule(
  { type: 'method', name: (name) => accountsMethods.includes(name), connectionId: () => true },
  5,
  60000
);

// Device registration: 10 / 60s (provisioning retries are legitimate).
DDPRateLimiter.addRule(
  { type: 'method', name: (name) => name === 'devices.create', connectionId: () => true },
  10,
  60000
);
