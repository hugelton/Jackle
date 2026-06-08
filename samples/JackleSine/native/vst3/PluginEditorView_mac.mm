#include "PluginEditorView_mac.h"
#include "VST3ParamBridge.h"

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

#include "pluginterfaces/gui/iplugview.h"

#include <cstring>

using namespace Steinberg;

@interface JackleMessageHandler : NSObject <WKScriptMessageHandler, WKNavigationDelegate>
@property(nonatomic, assign) VST3ParamBridge* bridge;
@property(nonatomic, assign) WKWebView* webView;
- (void)syncState;
@end

@implementation JackleMessageHandler
- (void)syncState {
  if (!self.bridge || !self.webView) return;
  const std::string json = self.bridge->stateJson();
  NSString* script = [NSString stringWithFormat:
    @"window.JackleBridge && window.JackleBridge.setState(%s);", json.c_str()];
  [self.webView evaluateJavaScript:script completionHandler:nil];
}

- (void)userContentController:(WKUserContentController*)controller
      didReceiveScriptMessage:(WKScriptMessage*)message {
  NSDictionary* body = [message.body isKindOfClass:[NSDictionary class]]
    ? (NSDictionary*)message.body : nil;
  NSString* type = body[@"type"];
  if ([type isEqualToString:@"parameter"]) {
    NSString* key = body[@"id"];
    NSNumber* value = body[@"value"];
    if (key && value) self.bridge->setParameter([key UTF8String], [value doubleValue]);
  } else if ([type isEqualToString:@"ready"]) {
    [self syncState];
  }
}

- (void)webView:(WKWebView*)webView
      didFinishNavigation:(WKNavigation*)navigation {
  [self syncState];
}
@end

PluginEditorView::PluginEditorView(Vst::EditController* controller)
: CPluginView(nullptr), controller_(controller) {
  setRect(ViewRect(0, 0, 640, 360));
}

PluginEditorView::~PluginEditorView() {
  removed();
}

tresult PLUGIN_API PluginEditorView::isPlatformTypeSupported(FIDString type) {
  return type && std::strcmp(type, kPlatformTypeNSView) == 0
    ? kResultTrue : kResultFalse;
}

tresult PLUGIN_API PluginEditorView::attached(void* parent, FIDString type) {
  if (isPlatformTypeSupported(type) != kResultTrue || !parent) return kResultFalse;

  NSView* parentView = (__bridge NSView*)parent;
  WKWebViewConfiguration* configuration = [[WKWebViewConfiguration alloc] init];
  WKUserContentController* content = [[WKUserContentController alloc] init];
  configuration.userContentController = content;
  [content addUserScript:[[WKUserScript alloc]
    initWithSource:@"window.__JACKLE_NATIVE__ = true;"
    injectionTime:WKUserScriptInjectionTimeAtDocumentStart
    forMainFrameOnly:YES]];

  bridge_ = new VST3ParamBridge(controller_);
  JackleMessageHandler* handler = [[JackleMessageHandler alloc] init];
  handler.bridge = bridge_;
  [content addScriptMessageHandler:handler name:@"jackle"];

  WKWebView* view = [[WKWebView alloc] initWithFrame:parentView.bounds
                                      configuration:configuration];
  [content release];
  [configuration release];
  handler.webView = view;
  view.navigationDelegate = handler;
  view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [parentView addSubview:view];
  messageHandler_ = (void*)handler;
  webView_ = (void*)view;

  NSBundle* bundle = [NSBundle bundleForClass:[JackleMessageHandler class]];
  NSURL* guiURL = [bundle URLForResource:@"index" withExtension:@"html"];
  if (guiURL) {
    [view loadFileURL:guiURL
      allowingReadAccessToURL:[guiURL URLByDeletingLastPathComponent]];
  } else {
    [view loadHTMLString:@"<html><body>Jackle GUI resource missing.</body></html>"
                 baseURL:nil];
  }
  return kResultOk;
}

tresult PLUGIN_API PluginEditorView::removed() {
  if (webView_) {
    WKWebView* view = (WKWebView*)webView_;
    [view.configuration.userContentController removeScriptMessageHandlerForName:@"jackle"];
    [view removeFromSuperview];
    [view release];
    webView_ = nullptr;
  }
  if (messageHandler_) {
    JackleMessageHandler* handler = (JackleMessageHandler*)messageHandler_;
    handler.bridge = nullptr;
    handler.webView = nil;
    [handler release];
    messageHandler_ = nullptr;
  }
  delete bridge_;
  bridge_ = nullptr;
  return CPluginView::removed();
}
