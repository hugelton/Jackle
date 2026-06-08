#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>

namespace ParamIds {

enum class Type { Float, Bool };

struct Info {
  uint32_t id;
  const char* key;
  Type type;
  double minValue;
  double maxValue;
  double defaultValue;
  const char* unit;
};

constexpr uint32_t frequency = 800267265u;
constexpr uint32_t level = 2610554845u;

constexpr std::array<Info, 2> all = {{
  { frequency, "frequency", Type::Float, 20.0, 2000.0, 440.0, "Hz" },
  { level, "level", Type::Float, 0.0, 1.0, 0.25, "" }
}};
constexpr uint32_t count = static_cast<uint32_t>(all.size());

inline int indexOf(uint32_t id) {
  for (std::size_t index = 0; index < all.size(); ++index) {
    if (all[index].id == id) return static_cast<int>(index);
  }
  return -1;
}

inline int indexOf(const char* key) {
  if (!key) return -1;
  for (std::size_t index = 0; index < all.size(); ++index) {
    const char* left = all[index].key;
    const char* right = key;
    while (*left && *right && *left == *right) { ++left; ++right; }
    if (*left == 0 && *right == 0) return static_cast<int>(index);
  }
  return -1;
}

inline double clampPlain(std::size_t index, double value) {
  const auto& info = all[index];
  if (info.type == Type::Bool) return value >= 0.5 ? 1.0 : 0.0;
  return std::clamp(value, info.minValue, info.maxValue);
}

inline double normalizedToPlain(std::size_t index, double normalized) {
  const auto& info = all[index];
  if (info.type == Type::Bool) return normalized >= 0.5 ? 1.0 : 0.0;
  return info.minValue + std::clamp(normalized, 0.0, 1.0) *
    (info.maxValue - info.minValue);
}

inline double plainToNormalized(std::size_t index, double plain) {
  const auto& info = all[index];
  if (info.type == Type::Bool) return plain >= 0.5 ? 1.0 : 0.0;
  return (clampPlain(index, plain) - info.minValue) /
    (info.maxValue - info.minValue);
}

} // namespace ParamIds
