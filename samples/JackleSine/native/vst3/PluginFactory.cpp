#include "PluginProcessor.h"
#include "PluginController.h"

#include "public.sdk/source/main/pluginfactory.h"

#define stringPluginName "JackleSine"

using namespace Steinberg;
using namespace Steinberg::Vst;

static const FUID kProcessorCID(0x85980DE0, 0x3F8F4C7D, 0x3D362813, 0x33880898);

BEGIN_FACTORY_DEF("Hugelton Instruments",
                  "https://example.invalid",
                  "mailto:support@example.invalid")

DEF_CLASS2(INLINE_UID_FROM_FUID(kProcessorCID),
           PClassInfo::kManyInstances, kVstAudioEffectClass, stringPluginName,
           Vst::kDistributable,
           "Instrument|Synth",
           "0.1.0", kVstVersionString,
           JackleSineProcessor::createInstance)

DEF_CLASS2(INLINE_UID_FROM_FUID(JackleSineController::cid),
           PClassInfo::kManyInstances, kVstComponentControllerClass,
           stringPluginName " Controller", 0, "",
           "0.1.0", kVstVersionString,
           JackleSineController::createInstance)

END_FACTORY
