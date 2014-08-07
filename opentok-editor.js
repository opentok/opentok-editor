var OpenTokAdapter = (function () {
  'use strict';

  function OpenTokAdapter (session) {
    this.session = session;
    this.session.on({
      connectionDestroyed: function (event) {
        this.trigger('client_left', event.connection.connectionId);
      },
      connectionCreated: function (event) {
        if (event.connection.data && event.connection.data.name) {
          this.trigger('set_name', event.connection.connectionId, event.connection.data.name);
        }
      },
      'signal:opentok-editor-operation': function (event) {
        if (event.from.connectionId === this.session.connection.connectionId) return;
        var data = JSON.parse(event.data);
        this.trigger('operation', data.operation);
        this.trigger('cursor', event.from.connectionId, data.cursor);
      },
      'signal:opentok-editor-cursor': function (event) {
        if (event.from.connectionId === this.session.connection.connectionId) return;
        var cursor = JSON.parse(event.data);
        this.trigger('cursor', event.from.connectionId, cursor);
      }
    }, this);
  }

  OpenTokAdapter.prototype.sendOperation = function (revision, operation, cursor) {
    this.session.signal({
      type: 'opentok-editor-operation', 
      data: JSON.stringify({
        revision: revision,
        operation: operation,
        cursor: cursor
      })
    }, (function (err) {
      if (!err) {
        this.trigger('ack');
      }
    }).bind(this));
  };

  OpenTokAdapter.prototype.sendCursor = function (cursor) {
    this.session.signal({
      type: 'cursor',
      data: JSON.stringify(cursor)
    });
  };

  OpenTokAdapter.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  OpenTokAdapter.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  return OpenTokAdapter;

}());
var OpenTokEditor = angular.module('opentok-editor', ['opentok'])
.directive('otEditor', ['OTSession', '$window', function (OTSession, $window) {
  return {
    restrict: 'E',
    template: '<div ng-if="connecting">Connecting...</div>' +
      '<div ng-show="!connecting"><div class="opentok-editor"></div></div>',
    link: function (scope, element, attrs) {
      var opentokEditor = element.context.querySelector("div.opentok-editor"),
          myCodeMirror,
          cmClient,
          doc,
          session = OTSession.session;
      scope.connecting = true;

      var createEditorClient = function(revision, clients) {
          if (!cmClient) {
              cmClient = new ot.EditorClient(
                revision,
                clients,
                new OpenTokAdapter(session),
                new ot.CodeMirrorAdapter(myCodeMirror)
              );
          }
          scope.$apply(function () {
            scope.connecting = false;
          });
      };

      var sessionConnected = function () {
        myCodeMirror = CodeMirror(opentokEditor, attrs);
        if (doc) {
            myCodeMirror.setValue(doc.str);
        }
        setTimeout(function () {
            // We wait 2 seconds for other clients to send us the doc before
            // initialising it to empty
            createEditorClient(0, []);
        }, 2000);
      };

      session.on({
        sessionConnected: function (event) {
          sessionConnected();
        },
        connectionCreated: function (event) {
          if (cmClient && event.connection.connectionId !== session.connection.connectionId) {
            session.signal({
              type: 'opentok-editor-doc',
              to: event.connection,
              data: JSON.stringify({
                revision: cmClient.revision,
                clients: cmClient.clients,
                str: myCodeMirror.getValue()
              })
            });
          }
        },
        'signal:opentok-editor-doc': function (event) {
          doc = JSON.parse(event.data);
          if (myCodeMirror) {
            myCodeMirror.setValue(doc.str);
          }
          createEditorClient(doc.revision, doc.clients);
        }
      });
      
      if (session.isConnected()) {
        sessionConnected();
      }
      
      // myCodeMirror.setOption("mode", "javascript");
    }
  };
}]);