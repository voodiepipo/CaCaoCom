import 'package:shared_preferences/shared_preferences.dart';

/// Keeps the signed-in field agent's ID on the device so every captured point
/// and saved plot can be stamped with it, even offline.
class Session {
  Session._(this._prefs);

  final SharedPreferences _prefs;
  static const _agentKey = 'agent_id';

  static Future<Session> load() async => Session._(await SharedPreferences.getInstance());

  String? get agentId => _prefs.getString(_agentKey);

  Future<void> signIn(String agentId) => _prefs.setString(_agentKey, agentId.trim().toUpperCase());

  Future<void> signOut() => _prefs.remove(_agentKey);
}
