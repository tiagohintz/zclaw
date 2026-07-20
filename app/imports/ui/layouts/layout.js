import { Template } from 'meteor/templating';
import './layout.html';

Template.Layout.helpers({
  page() {
    return Template.currentData().page;
  },
});
