cmake_minimum_required(VERSION 3.22.1)
project(mysteryvault_node_bridge LANGUAGES CXX)

if(NOT DEFINED NODE_INCLUDE_DIR)
    message(FATAL_ERROR "NODE_INCLUDE_DIR must point to the embedded Node.js headers")
endif()

add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES
    IMPORTED_LOCATION "${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so"
)

add_library(node_bridge SHARED node_bridge.cpp)
target_include_directories(node_bridge PRIVATE "${NODE_INCLUDE_DIR}")
find_library(log-lib log)
target_link_libraries(node_bridge PRIVATE node ${log-lib})
