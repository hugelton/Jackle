#pragma once

#include "public.sdk/source/common/pluginview.h"
#include "public.sdk/source/vst/vsteditcontroller.h"

class VST3ParamBridge;

class PluginEditorView final : public Steinberg::CPluginView {
public:
  explicit PluginEditorView(Steinberg::Vst::EditController* controller);
  ~PluginEditorView() override;
  Steinberg::tresult PLUGIN_API isPlatformTypeSupported(
    Steinberg::FIDString type) override;
  Steinberg::tresult PLUGIN_API attached(void* parent,
                                        Steinberg::FIDString type) override;
  Steinberg::tresult PLUGIN_API removed() override;

private:
  Steinberg::Vst::EditController* controller_ = nullptr;
  void* webView_ = nullptr;
  void* messageHandler_ = nullptr;
  VST3ParamBridge* bridge_ = nullptr;
};
