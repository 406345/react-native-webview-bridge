/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * Copyright (c) 2016-present, Ali Najafizadeh
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule WebViewBridge
 * @flow
 */
'use strict';

import React, { Component } from 'react';
var ReactNative = require('react-native');
var invariant = require('invariant');
var keyMirror = require('keymirror');
var resolveAssetSource = require('react-native/Libraries/Image/resolveAssetSource');

var {
  ActivityIndicator,
  EdgeInsetsPropType,
  StyleSheet,
  Text,
  View,
  WebView,
  requireNativeComponent,
  UIManager,
  NativeModules: {
    WebViewBridgeManager
  }
} = ReactNative;
import PropTypes from 'prop-types';

var BGWASH = 'rgba(255,255,255,0.8)';
var RCT_WEBVIEWBRIDGE_REF = 'webviewbridge';

var RCTWebViewBridgeManager = WebViewBridgeManager;

var WebViewBridgeState = keyMirror({
  IDLE: null,
  LOADING: null,
  ERROR: null,
});

var NavigationType = {
  click: RCTWebViewBridgeManager.NavigationType.LinkClicked,
  formsubmit: RCTWebViewBridgeManager.NavigationType.FormSubmitted,
  backforward: RCTWebViewBridgeManager.NavigationType.BackForward,
  reload: RCTWebViewBridgeManager.NavigationType.Reload,
  formresubmit: RCTWebViewBridgeManager.NavigationType.FormResubmitted,
  other: RCTWebViewBridgeManager.NavigationType.Other,
};

var JSNavigationScheme = RCTWebViewBridgeManager.JSNavigationScheme;

type ErrorEvent = {
  domain: any;
  code: any;
  description: any;
}

type Event = Object;

var defaultRenderLoading = () => (
  <View style={styles.loadingView}>
    <ActivityIndicator/>
  </View>
);
var defaultRenderError = (errorDomain, errorCode, errorDesc) => (
  <View style={styles.errorContainer}>
    <Text style={styles.errorTextTitle}>
      Error loading page
    </Text>
    <Text style={styles.errorText}>
      {'Domain: ' + errorDomain}
    </Text>
    <Text style={styles.errorText}>
      {'Error Code: ' + errorCode}
    </Text>
    <Text style={styles.errorText}>
      {'Description: ' + errorDesc}
    </Text>
  </View>
);

/**
 * Renders a native WebView.
 */
export default class WebViewBridge extends Component {

  constructor() {
    super();
    this.JSNavigationScheme = JSNavigationScheme,
    this.NavigationType = NavigationType,

    // this.propTypes = {
    //   ...WebView.propTypes,
  
    //   /**
    //    * Will be called once the message is being sent from webview
    //    */
    //   onBridgeMessage: PropTypes.func,
  
    //   hideKeyboardAccessoryView: PropTypes.bool,
    // }
    // this.props = {...PropTypes.props};
    this.onBridgeMessage = PropTypes.func;
    this.hideKeyboardAccessoryView = PropTypes.bool;
    
    this.state =  {
      viewState: WebViewBridgeState.IDLE,
      lastErrorEvent: null,
      startInLoadingState: true,
    };
  }

   
  componentWillMount() {
    if (this.props.startInLoadingState) {
      this.setState({viewState: WebViewBridgeState.LOADING});
    }
  }
 
  goForward() {
    UIManager.dispatchViewManagerCommand(
      this.getWebViewBridgeHandle(),
      UIManager.RCTWebViewBridge.Commands.goForward,
      null
    );
  }

  goBack() {
    UIManager.dispatchViewManagerCommand(
      this.getWebViewBridgeHandle(),
      UIManager.RCTWebViewBridge.Commands.goBack,
      null
    );
  }

  reload() {
    UIManager.dispatchViewManagerCommand(
      this.getWebViewBridgeHandle(),
      UIManager.RCTWebViewBridge.Commands.reload,
      null
    );
  }

  sendToBridge (message) {
    WebViewBridgeManager.sendToBridge(this.getWebViewBridgeHandle(), message);
  }

  /**
   * We return an event with a bunch of fields including:
   *  url, title, loading, canGoBack, canGoForward
   */
  updateNavigationState(event) {
    if (this.props.onNavigationStateChange) {
      this.props.onNavigationStateChange(event.nativeEvent);
    }
  }

  getWebViewBridgeHandle() {
    return ReactNative.findNodeHandle(this.refs[RCT_WEBVIEWBRIDGE_REF]);
  }

  onLoadingStart(event) { 
    var onLoadStart = this.props.onLoadStart;
    onLoadStart && onLoadStart(event);
    this.updateNavigationState(event);
  }

  onLoadingError(event) {
 
    event.persist(); // persist this event because we need to store it
    var {onError, onLoadEnd} = this.props;
    onError && onError(event);
    onLoadEnd && onLoadEnd(event);
    console.warn('Encountered an error loading page', event.nativeEvent);
    
    this.setState({
      lastErrorEvent: event.nativeEvent,
      viewState: WebViewBridgeState.ERROR
    });
  }

  onLoadingFinish(event) {
    var {onLoad, onLoadEnd} = this.props;
    onLoad && onLoad(event);
    onLoadEnd && onLoadEnd(event);
    this.setState({
      viewState: WebViewBridgeState.IDLE,
    });
    this.updateNavigationState(event);
  }

  render() {
 
    var otherView = null;

    if (this.state.viewState === WebViewBridgeState.LOADING) {
      otherView = (this.props.renderLoading || defaultRenderLoading)();
    } else if (this.state.viewState === WebViewBridgeState.ERROR) {
      var errorEvent = this.state.lastErrorEvent;
      invariant(
        errorEvent != null,
        'lastErrorEvent expected to be non-null'
      );
      otherView = (this.props.renderError || defaultRenderError)(
        errorEvent.domain,
        errorEvent.code,
        errorEvent.description
      );
    } else if (this.state.viewState !== WebViewBridgeState.IDLE) {
      console.error(
        'RCTWebViewBridge invalid state encountered: ' + this.state.loading
      );
    }

    var webViewStyles = [styles.container, styles.webView, this.props.style];
    if (this.state.viewState === WebViewBridgeState.LOADING ||
      this.state.viewState === WebViewBridgeState.ERROR) {
      // if we're in either LOADING or ERROR states, don't show the webView
      webViewStyles.push(styles.hidden);
    }

    var onShouldStartLoadWithRequest = this.props.onShouldStartLoadWithRequest && ((event) => {
      var shouldStart = this.props.onShouldStartLoadWithRequest &&
        this.props.onShouldStartLoadWithRequest(event.nativeEvent);
      RCTWebViewBridgeManager.startLoadWithResult(!!shouldStart, event.nativeEvent.lockIdentifier);
    });

    var {javaScriptEnabled, domStorageEnabled} = this.props;
    if (this.props.javaScriptEnabledAndroid) {
      console.warn('javaScriptEnabledAndroid is deprecated. Use javaScriptEnabled instead');
      javaScriptEnabled = this.props.javaScriptEnabledAndroid;
    }
    if (this.props.domStorageEnabledAndroid) {
      console.warn('domStorageEnabledAndroid is deprecated. Use domStorageEnabled instead');
      domStorageEnabled = this.props.domStorageEnabledAndroid;
    }

    var onBridgeMessage = (event) => {
      const onBridgeMessageCallback = this.props.onBridgeMessage;
      if (onBridgeMessageCallback) {
        const messages = event.nativeEvent.messages;
        messages.forEach((message) => {
          onBridgeMessageCallback(message);
        });
      }
    };

    let {source, ...props} = {...this.props};
    // delete props.onBridgeMessage;
    // delete props.onShouldStartLoadWithRequest;

    var webView =
      <RCTWebViewBridge
        ref={RCT_WEBVIEWBRIDGE_REF}
        key="webViewKey"
        {...this.props}
        source={resolveAssetSource(source)}
        style={webViewStyles}
        onLoadingStart={this.onLoadingStart.bind(this)}
        onLoadingFinish={this.onLoadingFinish.bind(this)}
        onLoadingError={this.onLoadingError.bind(this)}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onBridgeMessage={onBridgeMessage}
      />;

    return (
      <View style={styles.container}>
        {webView}
        {otherView}
      </View>
    );
  }
}

var RCTWebViewBridge = requireNativeComponent('RCTWebViewBridge', WebViewBridge, {
  nativeOnly: {
    onLoadingStart: true,
    onLoadingError: true,
    onLoadingFinish: true,
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BGWASH,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 2,
  },
  errorTextTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 10,
  },
  hidden: {
    height: 0,
    flex: 0, // disable 'flex:1' when hiding a View
  },
  loadingView: {
    backgroundColor: BGWASH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webView: {
    backgroundColor: '#ffffff',
  }
});
