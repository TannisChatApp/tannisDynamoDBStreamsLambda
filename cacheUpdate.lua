local curr_max = redis.call('get', KEYS[1])
local res = nil
if ((curr_max == false) or (tonumber(ARGV[1]) > curr_max))
then
    res = redis.call('set', KEYS[1], tonumber(ARGV[1]))
end
return res